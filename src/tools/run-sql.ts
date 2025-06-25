#!/usr/bin/env ts-node

import { Command } from 'commander';
import { PostgresClient, PgConnection, SqlScript } from '../utils/postgres-client';
import { logger } from '../utils/enhanced-logger';
import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';
import * as fs from 'fs/promises';
import * as path from 'path';

// Register the autocomplete prompt type
inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

const program = new Command();

program
  .name('run-sql')
  .description('Run SQL scripts from files with variable substitution')
  .argument('[script]', 'Path to SQL script file')
  .option('-h, --host <host>', 'Database host')
  .option('-d, --database <database>', 'Database name')
  .option('-u, --user <user>', 'Database user')
  .option('-p, --port <port>', 'Database port', '5432')
  .option('-v, --var <key=value>', 'Set variable value (can be used multiple times)', (val, prev: string[]) => {
    prev = prev || [];
    prev.push(val);
    return prev;
  }, [])
  .option('-f, --format <format>', 'Output format: json, csv, or table', 'table')
  .option('-o, --output <file>', 'Output file (stdout if not specified)')
  .option('--list', 'List available SQL scripts')
  .action(async (scriptPath, options) => {
    const client = new PostgresClient();

    try {
      // List scripts if requested
      if (options.list) {
        const scripts = await client.listScripts();
        if (scripts.length === 0) {
          logger.warn('No SQL scripts found in sqlscripts directory');
          return;
        }
        
        logger.info('Available SQL scripts:');
        scripts.forEach(script => {
          const vars = script.variables.length > 0 
            ? ` (variables: ${script.variables.join(', ')})`
            : '';
          logger.info(`  ${script.name}${vars}`);
        });
        return;
      }

      // Parse variable options
      const cliVariables: { [key: string]: string } = {};
      if (options.var) {
        for (const varDef of options.var) {
          const [key, ...valueParts] = varDef.split('=');
          if (key && valueParts.length > 0) {
            cliVariables[key] = valueParts.join('=');
          }
        }
      }

      // Get database connection
      let connection: PgConnection | null = null;

      // First try to find connection from .pgpass
      if (options.host || options.database || options.user) {
        connection = await client.findConnection({
          host: options.host,
          database: options.database,
          user: options.user,
          port: parseInt(options.port, 10)
        });
        
        if (!connection) {
          logger.error('No matching connection found in .pgpass file');
          logger.info('Make sure your .pgpass file contains an entry for the specified connection');
          process.exit(1);
        }
      } else {
        // Get all connections and let user choose
        const connections = await client.getConnections();
        
        if (connections.length === 0) {
          logger.error('No connections found in .pgpass file');
          logger.info('Please configure your database connections in ~/.pgpass');
          process.exit(1);
        }
        
        if (connections.length === 1) {
          connection = connections[0];
          logger.info(`Using connection: ${connection.user}@${connection.host}:${connection.port}/${connection.database}`);
        } else {
          // Ask user to select connection
          const { selectedConn } = await inquirer.prompt([
            {
              type: 'autocomplete',
              name: 'selectedConn',
              message: 'Select database connection:',
              source: async (_answers: any, input: string) => {
                const choices = connections.map((conn, idx) => ({
                  name: `${conn.user}@${conn.host}:${conn.port}/${conn.database}`,
                  value: idx
                }));
                
                if (!input) return choices;
                const searchTerm = input.toLowerCase();
                return choices.filter(choice => 
                  choice.name.toLowerCase().includes(searchTerm)
                );
              }
            }
          ]);
          
          connection = connections[selectedConn];
        }
      }

      await client.connect(connection);

      // Get script
      let script: SqlScript;
      
      if (scriptPath) {
        // Load specified script
        const fullPath = path.resolve(scriptPath);
        script = await client.loadScript(fullPath);
      } else {
        // List scripts and let user choose
        const scripts = await client.listScripts();
        
        if (scripts.length === 0) {
          logger.error('No SQL scripts found in sqlscripts directory');
          process.exit(1);
        }
        
        const { selectedScript } = await inquirer.prompt([
          {
            type: 'autocomplete',
            name: 'selectedScript',
            message: 'Select SQL script to run:',
            source: async (_answers: any, input: string) => {
              const choices = scripts.map((s, idx) => {
                const vars = s.variables.length > 0 
                  ? ` (${s.variables.join(', ')})`
                  : '';
                return {
                  name: `${s.name}${vars}`,
                  value: idx
                };
              });
              
              if (!input) return choices;
              const searchTerm = input.toLowerCase();
              return choices.filter(choice => 
                choice.name.toLowerCase().includes(searchTerm)
              );
            }
          }
        ]);
        
        script = scripts[selectedScript];
      }

      // Get variable values
      const variables: { [key: string]: string } = { ...cliVariables };
      
      if (script.variables.length > 0) {
        // Load defaults
        const defaults = await client.getScriptDefaults(script.path);
        
        // Ask for any missing variables
        for (const varName of script.variables) {
          if (!variables[varName]) {
            const { value } = await inquirer.prompt([
              {
                type: 'input',
                name: 'value',
                message: `Enter value for ${varName}:`,
                default: defaults[varName] || ''
              }
            ]);
            variables[varName] = value;
          }
        }
        
        // Save defaults for next time
        await client.saveScriptDefaults(script.path, variables);
      }

      // Get output format if not specified
      let outputFormat = options.format;
      if (!['json', 'csv', 'table'].includes(outputFormat)) {
        const { format } = await inquirer.prompt([
          {
            type: 'autocomplete',
            name: 'format',
            message: 'Output format:',
            source: async (_answers: any, input: string) => {
              const choices = [
                { name: 'Table (formatted)', value: 'table' },
                { name: 'JSON', value: 'json' },
                { name: 'CSV', value: 'csv' }
              ];
              if (!input) return choices;
              const searchTerm = input.toLowerCase();
              return choices.filter(choice => 
                choice.name.toLowerCase().includes(searchTerm)
              );
            },
            default: 'table'
          }
        ]);
        outputFormat = format;
      }

      // Get output file for CSV if not specified
      let outputFile = options.output;
      if (outputFormat === 'csv' && !outputFile && !options.output) {
        const { useFile } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'useFile',
            message: 'Save to file?',
            default: true
          }
        ]);
        
        if (useFile) {
          const { filename } = await inquirer.prompt([
            {
              type: 'input',
              name: 'filename',
              message: 'Output filename:',
              default: `${path.basename(script.name, '.sql')}_${new Date().toISOString().split('T')[0]}.csv`
            }
          ]);
          outputFile = filename;
        }
      }

      // Execute script
      logger.info('Executing SQL script...');
      const results = await client.executeScript(script, { variables });
      
      // Format results
      const formatted = client.formatResults(results, outputFormat as any);
      
      // Output results
      if (outputFile) {
        await fs.writeFile(outputFile, formatted, 'utf-8');
        logger.success(`Results saved to: ${outputFile}`);
      } else {
        console.log(formatted);
      }
      
      // Show summary
      const totalRows = results.reduce((sum, r) => sum + (r.rowCount || 0), 0);
      if (outputFormat !== 'table' || outputFile) {
        logger.info(`Total rows: ${totalRows}`);
      }

    } catch (error) {
      logger.error('Failed to execute SQL script:', error);
      process.exit(1);
    }
  });

program.parse();
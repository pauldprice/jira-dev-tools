import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';
import { logger } from '../../../utils/enhanced-logger';
import { PostgresClient } from '../../../utils/postgres-client';
import * as path from 'path';

// Register the autocomplete prompt type
inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

export async function promptRunSql() {
  const pgClient = new PostgresClient();
  
  // First check if there are any connections
  const connections = await pgClient.getConnections();
  if (connections.length === 0) {
    logger.error('No database connections found in ~/.pgpass');
    logger.info('Please configure your database connections in ~/.pgpass file');
    process.exit(1);
  }
  
  // Get available SQL scripts
  const scripts = await pgClient.listScripts();
  if (scripts.length === 0) {
    logger.warn('No SQL scripts found in sqlscripts directory');
    logger.info('Create .sql files in the sqlscripts directory to use this feature');
  }
  
  // Select connection
  let selectedConnection;
  if (connections.length === 1) {
    selectedConnection = connections[0];
    logger.info(`Using connection: ${selectedConnection.user}@${selectedConnection.host}:${selectedConnection.port}/${selectedConnection.database}`);
  } else {
    const { connIndex } = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'connIndex',
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
    selectedConnection = connections[connIndex];
  }
  
  // Select script if available
  let scriptPath = '';
  let variables: { [key: string]: string } = {};
  
  if (scripts.length > 0) {
    const { scriptIndex } = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'scriptIndex',
        message: 'Select SQL script:',
        source: async (_answers: any, input: string) => {
          const choices = scripts.map((script, idx) => {
            const vars = script.variables.length > 0 
              ? ` (variables: ${script.variables.map(v => `${v.name}:${v.type}`).join(', ')})`
              : '';
            return {
              name: `${script.name}${vars}`,
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
    
    const selectedScript = scripts[scriptIndex];
    scriptPath = selectedScript.path;
    
    // Get variable values if needed
    if (selectedScript.variables.length > 0) {
      const defaults = await pgClient.getScriptDefaults(selectedScript.path);
      
      for (const varInfo of selectedScript.variables) {
        const { value } = await inquirer.prompt([
          {
            type: 'input',
            name: 'value',
            message: `Enter value for ${varInfo.name} (${varInfo.type}):`,
            default: defaults[varInfo.name] || '',
            validate: (input: string) => {
              if (!input.trim() && varInfo.type !== 'text') {
                return `Value required for ${varInfo.type} field`;
              }
              if (varInfo.type === 'int' && input.trim() && isNaN(parseInt(input, 10))) {
                return 'Must be a valid integer';
              }
              if (varInfo.type === 'float' && input.trim() && isNaN(parseFloat(input))) {
                return 'Must be a valid number';
              }
              if (varInfo.type === 'boolean' && input.trim() && !['true', 'false', '1', '0', 't', 'f'].includes(input.toLowerCase())) {
                return 'Must be true/false, 1/0, or t/f';
              }
              if (varInfo.type === 'json' && input.trim()) {
                try {
                  JSON.parse(input);
                } catch {
                  return 'Must be valid JSON';
                }
              }
              return true;
            }
          }
        ]);
        variables[varInfo.name] = value;
      }
    }
  } else {
    // Ask for script path manually
    const { manualPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'manualPath',
        message: 'Enter path to SQL script:',
        validate: (input: string) => {
          if (!input.trim()) return 'Script path is required';
          if (!input.endsWith('.sql')) return 'File must be a .sql file';
          return true;
        }
      }
    ]);
    scriptPath = manualPath;
  }
  
  // Get output format
  const { format } = await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'format',
      message: 'Output format:',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'Table (formatted)', value: 'table' },
          { name: 'CSV', value: 'csv' },
          { name: 'JSON', value: 'json' }
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
  
  // Get output file for CSV
  let outputFile;
  if (format === 'csv') {
    const { useFile } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useFile',
        message: 'Save to file?',
        default: true
      }
    ]);
    
    if (useFile) {
      const scriptName = path.basename(scriptPath || 'query', '.sql');
      const { filename } = await inquirer.prompt([
        {
          type: 'input',
          name: 'filename',
          message: 'Output filename:',
          default: `${scriptName}_${new Date().toISOString().split('T')[0]}.csv`
        }
      ]);
      outputFile = filename;
    }
  }
  
  return {
    scriptPath,
    host: selectedConnection.host,
    port: selectedConnection.port.toString(),
    database: selectedConnection.database,
    user: selectedConnection.user,
    variables,
    format,
    outputFile
  };
}
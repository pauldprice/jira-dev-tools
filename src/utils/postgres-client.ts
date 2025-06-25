import { Client, QueryResult } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { logger } from './enhanced-logger';
import { CacheManager } from './cache-manager';

export interface PgConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
}

export interface SqlScript {
  name: string;
  path: string;
  content: string;
  variables: string[];
}

export interface ScriptDefaults {
  [scriptPath: string]: {
    [variable: string]: string;
  };
}

export interface QueryOptions {
  variables?: { [key: string]: string };
  outputFormat?: 'json' | 'csv' | 'table';
  outputFile?: string;
}

export class PostgresClient {
  private connection: PgConnection | null = null;
  private cacheManager: CacheManager;

  constructor() {
    this.cacheManager = new CacheManager();
  }

  private async parsePgpass(): Promise<PgConnection[]> {
    const pgpassPath = path.join(os.homedir(), '.pgpass');
    
    try {
      const content = await fs.readFile(pgpassPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      
      return lines.map(line => {
        const [host, port, database, user, password] = line.split(':');
        return {
          host: host || 'localhost',
          port: parseInt(port || '5432', 10),
          database: database || '*',
          user: user || '*',
          password: password || undefined
        };
      });
    } catch (error) {
      logger.debug('Could not read .pgpass file:', error);
      return [];
    }
  }

  async getConnections(): Promise<PgConnection[]> {
    return this.parsePgpass();
  }

  async findConnection(criteria: Partial<PgConnection>): Promise<PgConnection | null> {
    const connections = await this.getConnections();
    
    for (const conn of connections) {
      if (criteria.host && conn.host !== criteria.host && conn.host !== '*') continue;
      if (criteria.database && conn.database !== criteria.database && conn.database !== '*') continue;
      if (criteria.user && conn.user !== criteria.user && conn.user !== '*') continue;
      if (criteria.port && conn.port !== criteria.port) continue;
      
      return conn;
    }
    
    return null;
  }

  async connect(connection: PgConnection): Promise<void> {
    this.connection = connection;
  }

  async listScripts(baseDir?: string): Promise<SqlScript[]> {
    const scriptsDir = baseDir || path.join(process.cwd(), 'sqlscripts');
    const scripts: SqlScript[] = [];
    
    async function scanDirectory(dir: string, prefix = ''): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath, relativePath);
          } else if (entry.name.endsWith('.sql')) {
            const content = await fs.readFile(fullPath, 'utf-8');
            const variables = extractVariables(content);
            
            scripts.push({
              name: relativePath,
              path: fullPath,
              content,
              variables
            });
          }
        }
      } catch (error) {
        logger.debug(`Could not scan directory ${dir}:`, error);
      }
    }
    
    await scanDirectory(scriptsDir);
    return scripts.sort((a, b) => a.name.localeCompare(b.name));
  }

  async loadScript(scriptPath: string): Promise<SqlScript> {
    const content = await fs.readFile(scriptPath, 'utf-8');
    const variables = extractVariables(content);
    
    return {
      name: path.basename(scriptPath),
      path: scriptPath,
      content,
      variables
    };
  }

  async getScriptDefaults(scriptPath: string): Promise<{ [variable: string]: string }> {
    const cacheKey = `sql-defaults:${scriptPath}`;
    const cached = await this.cacheManager.get(cacheKey);
    return (cached as { [variable: string]: string }) || {};
  }

  async saveScriptDefaults(scriptPath: string, defaults: { [variable: string]: string }): Promise<void> {
    const cacheKey = `sql-defaults:${scriptPath}`;
    await this.cacheManager.set(cacheKey, defaults); // Uses default TTL
  }

  async executeScript(script: SqlScript, options: QueryOptions = {}): Promise<QueryResult[]> {
    if (!this.connection) {
      throw new Error('Not connected to database');
    }

    const client = new Client({
      host: this.connection.host,
      port: this.connection.port,
      database: this.connection.database,
      user: this.connection.user,
      password: this.connection.password,
    });

    try {
      await client.connect();
      logger.debug(`Connected to ${this.connection.host}:${this.connection.port}/${this.connection.database} as ${this.connection.user}`);
      
      // Replace variables in the script
      let processedContent = script.content;
      if (options.variables) {
        for (const [varName, value] of Object.entries(options.variables)) {
          const regex = new RegExp(`\\$\\{${varName}\\}`, 'g');
          processedContent = processedContent.replace(regex, value);
        }
      }
      
      // Split by semicolon but preserve semicolons within strings
      const statements = splitSqlStatements(processedContent);
      const results: QueryResult[] = [];
      
      for (const statement of statements) {
        const trimmed = statement.trim();
        if (trimmed) {
          logger.debug(`Executing SQL: ${trimmed.substring(0, 100)}...`);
          try {
            const result = await client.query(trimmed);
            results.push(result);
          } catch (queryError: any) {
            throw new Error(`SQL query failed: ${queryError.message}\nQuery: ${trimmed.substring(0, 200)}${trimmed.length > 200 ? '...' : ''}`);
          }
        }
      }
      
      return results;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to database at ${this.connection.host}:${this.connection.port}. Is the database running?`);
      } else if (error.code === '28P01') {
        throw new Error(`Authentication failed for user ${this.connection.user}. Check your .pgpass file.`);
      } else if (error.code === '3D000') {
        throw new Error(`Database "${this.connection.database}" does not exist`);
      }
      throw error;
    } finally {
      await client.end();
    }
  }

  formatResults(results: QueryResult[], format: 'json' | 'csv' | 'table' = 'table'): string {
    if (results.length === 0) return 'No results';
    
    const allRows = results.flatMap(r => r.rows);
    
    switch (format) {
      case 'json':
        return JSON.stringify(allRows, null, 2);
        
      case 'csv':
        if (allRows.length === 0) return '';
        const headers = Object.keys(allRows[0]);
        const csvRows = [
          headers.join(','),
          ...allRows.map(row => 
            headers.map(h => {
              const value = row[h];
              if (value === null || value === undefined) return '';
              const strValue = String(value);
              // Escape quotes and wrap in quotes if contains comma, quote, or newline
              if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
                return `"${strValue.replace(/"/g, '""')}"`;
              }
              return strValue;
            }).join(',')
          )
        ];
        return csvRows.join('\n');
        
      case 'table':
        if (allRows.length === 0) return 'No rows returned';
        
        // Calculate column widths
        const tableHeaders = Object.keys(allRows[0]);
        const widths: { [key: string]: number } = {};
        
        tableHeaders.forEach(h => {
          widths[h] = h.length;
          allRows.forEach(row => {
            const len = String(row[h] ?? '').length;
            if (len > widths[h]) widths[h] = len;
          });
        });
        
        // Build table
        const separator = '+' + tableHeaders.map(h => '-'.repeat(widths[h] + 2)).join('+') + '+';
        const headerRow = '|' + tableHeaders.map(h => ` ${h.padEnd(widths[h])} `).join('|') + '|';
        const dataRows = allRows.map(row => 
          '|' + tableHeaders.map(h => ` ${String(row[h] ?? '').padEnd(widths[h])} `).join('|') + '|'
        );
        
        return [
          separator,
          headerRow,
          separator,
          ...dataRows,
          separator,
          `(${allRows.length} row${allRows.length !== 1 ? 's' : ''})`
        ].join('\n');
    }
  }
}

function extractVariables(content: string): string[] {
  const regex = /\$\{(\w+)\}/g;
  const variables = new Set<string>();
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    variables.add(match[1]);
  }
  
  return Array.from(variables);
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let escaped = false;
  
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const prevChar = i > 0 ? sql[i - 1] : '';
    
    // Handle escape sequences
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      escaped = true;
      current += char;
      continue;
    }
    
    // Handle strings
    if ((char === "'" || char === '"') && !inString) {
      inString = true;
      stringChar = char;
      current += char;
    } else if (char === stringChar && inString && prevChar !== '\\') {
      inString = false;
      stringChar = '';
      current += char;
    } else if (char === ';' && !inString) {
      // End of statement
      if (current.trim()) {
        statements.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last statement if any
  if (current.trim()) {
    statements.push(current.trim());
  }
  
  return statements;
}
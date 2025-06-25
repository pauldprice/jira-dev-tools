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

export interface SqlVariable {
  name: string;
  type: 'text' | 'int' | 'float' | 'date' | 'timestamp' | 'boolean' | 'json';
}

export interface SqlScript {
  name: string;
  path: string;
  content: string;
  variables: SqlVariable[];
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
      
      // Prepare content with placeholders for parameterized queries
      let processedContent = script.content;
      const paramValues: any[] = [];
      const paramTypes: { [key: number]: string } = {};
      let paramIndex = 1;
      
      if (options.variables && script.variables.length > 0) {
        // Create a map of variable info for quick lookup
        const varMap = new Map(script.variables.map(v => [v.name, v]));
        
        // Create a map to track parameter indices for each variable
        const varParamMap = new Map<string, number>();
        
        // First pass: assign parameter indices to each unique variable
        for (const [varName, value] of Object.entries(options.variables)) {
          const varInfo = varMap.get(varName);
          if (!varInfo) continue;
          
          const currentIndex = paramIndex++;
          varParamMap.set(varName, currentIndex);
          paramValues.push(formatValue(value, varInfo.type));
          paramTypes[currentIndex] = varInfo.type;
        }
        
        // Second pass: replace all occurrences with the assigned parameter index
        for (const [varName, paramIdx] of varParamMap.entries()) {
          const varInfo = varMap.get(varName);
          if (!varInfo) continue;
          
          // Add type cast for PostgreSQL
          const pgType = getPgTypeCast(varInfo.type);
          const replacement = pgType ? `$${paramIdx}::${pgType}` : `$${paramIdx}`;
          
          const regex = new RegExp(`\\$\\{${varName}(?::\\w+)?\\}`, 'g');
          processedContent = processedContent.replace(regex, replacement);
        }
        
        logger.debug(`Processed SQL with parameters: ${processedContent}`);
        logger.debug(`Parameter values: ${JSON.stringify(paramValues)}`);
      }
      
      // Split by semicolon but preserve semicolons within strings
      const statements = splitSqlStatements(processedContent);
      const results: QueryResult[] = [];
      
      for (const statement of statements) {
        const trimmed = statement.trim();
        if (trimmed) {
          logger.debug(`Executing SQL: ${trimmed.substring(0, 100)}...`);
          
          // Count how many parameters this statement uses
          const paramMatches = trimmed.match(/\$\d+/g) || [];
          const maxParam = paramMatches.reduce((max, match) => {
            const num = parseInt(match.substring(1));
            return Math.max(max, num);
          }, 0);
          
          // Get the subset of parameters for this statement
          const stmtParams = paramValues.slice(0, maxParam);
          
          try {
            const result = await client.query(trimmed, stmtParams);
            results.push(result);
          } catch (queryError: any) {
            const errorDetails = [];
            errorDetails.push(`SQL Error: ${queryError.message}`);
            
            if (queryError.code) {
              errorDetails.push(`Error Code: ${queryError.code}`);
            }
            if (queryError.position) {
              // Try to show the error position in the query
              const pos = parseInt(queryError.position);
              const queryLines = trimmed.split('\n');
              let currentPos = 0;
              let errorLine = 0;
              let errorCol = 0;
              
              for (let i = 0; i < queryLines.length; i++) {
                if (currentPos + queryLines[i].length >= pos) {
                  errorLine = i + 1;
                  errorCol = pos - currentPos;
                  break;
                }
                currentPos += queryLines[i].length + 1; // +1 for newline
              }
              
              errorDetails.push(`Position: Line ${errorLine}, Column ${errorCol}`);
            }
            if (queryError.detail) {
              errorDetails.push(`Detail: ${queryError.detail}`);
            }
            if (queryError.hint) {
              errorDetails.push(`Hint: ${queryError.hint}`);
            }
            
            errorDetails.push(`\nQuery:\n${trimmed}`);
            if (stmtParams.length > 0) {
              errorDetails.push(`\nParameters: ${JSON.stringify(stmtParams)}`);
            }
            
            throw new Error(errorDetails.join('\n'));
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

function formatValue(value: string, type: string): any {
  switch (type) {
    case 'int':
      return parseInt(value, 10);
    case 'float':
      return parseFloat(value);
    case 'boolean':
      return value.toLowerCase() === 'true' || value === '1' || value === 't';
    case 'json':
      try {
        return JSON.parse(value);
      } catch {
        return value; // If invalid JSON, pass as string
      }
    case 'date':
    case 'timestamp':
    case 'text':
    default:
      return value; // PostgreSQL will handle date/timestamp conversion
  }
}

function getPgTypeCast(type: string): string | null {
  switch (type) {
    case 'text':
      return 'text';
    case 'int':
      return 'integer';
    case 'float':
      return 'numeric';
    case 'date':
      return 'date';
    case 'timestamp':
      return 'timestamp';
    case 'boolean':
      return 'boolean';
    case 'json':
      return 'json';
    default:
      return null;
  }
}

function extractVariables(content: string): SqlVariable[] {
  // Match ${name} or ${name:type}
  const regex = /\$\{(\w+)(?::(\w+))?\}/g;
  const variables = new Map<string, SqlVariable>();
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const type = match[2] || 'text'; // Default to text if no type specified
    
    // Validate type
    const validTypes = ['text', 'int', 'float', 'date', 'timestamp', 'boolean', 'json'];
    const normalizedType = validTypes.includes(type) ? type : 'text';
    
    variables.set(name, { name, type: normalizedType as any });
  }
  
  return Array.from(variables.values());
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
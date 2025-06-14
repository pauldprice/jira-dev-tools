import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';
export type LogListener = (level: LogLevel, message: string, metadata?: any) => void;

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  metadata?: any;
}

export interface LoggerConfig {
  level: LogLevel;
  useColor: boolean;
  silent: boolean;
  listeners: LogListener[];
}

export class EnhancedLogger {
  private static instance: EnhancedLogger;
  protected config: LoggerConfig;
  protected logHistory: LogEntry[] = [];
  private readonly logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    success: 1,
    warn: 2,
    error: 3,
  };

  private constructor() {
    this.config = {
      level: (process.env.LOG_LEVEL as LogLevel) || 'info',
      useColor: this.shouldUseColor(),
      silent: process.env.NODE_ENV === 'test',
      listeners: [],
    };
  }

  static getInstance(): EnhancedLogger {
    if (!EnhancedLogger.instance) {
      EnhancedLogger.instance = new EnhancedLogger();
    }
    return EnhancedLogger.instance;
  }

  protected shouldUseColor(): boolean {
    if (
      !process.stdout.isTTY ||
      process.env.NO_COLOR ||
      process.env.TERM === 'dumb' ||
      process.env.CI ||
      process.env.CONTINUOUS_INTEGRATION ||
      process.env.GITHUB_ACTIONS
    ) {
      return false;
    }
    return true;
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.config.silent) return false;
    return this.logLevels[level] >= this.logLevels[this.config.level];
  }

  private colorize(color: keyof typeof chalk, text: string): string {
    if (!this.config.useColor) return text;
    return (chalk[color] as any)(text);
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    const prefix = process.env.LOG_TIMESTAMPS === 'true' ? `[${timestamp}] ` : '';
    
    switch (level) {
      case 'debug':
        return this.colorize('gray', `${prefix}[DEBUG] ${message}`);
      case 'info':
        return this.colorize('cyan', `${prefix}${message}`);
      case 'success':
        return this.colorize('green', `${prefix}✓ ${message}`);
      case 'warn':
        return this.colorize('yellow', `${prefix}⚠ ${message}`);
      case 'error':
        return this.colorize('red', `${prefix}✗ ${message}`);
    }
  }

  private log(level: LogLevel, message: string, metadata?: any): void {
    // Store in history
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      metadata,
    };
    this.logHistory.push(entry);

    // Notify listeners
    this.config.listeners.forEach(listener => {
      listener(level, message, metadata);
    });

    // Output to console if not silent
    if (this.shouldLog(level)) {
      const formattedMessage = this.formatMessage(level, message);
      
      switch (level) {
        case 'error':
          console.error(formattedMessage);
          break;
        case 'warn':
          console.warn(formattedMessage);
          break;
        default:
          console.log(formattedMessage);
      }
    }
  }

  // Public logging methods
  debug(message: string, metadata?: any): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: any): void {
    this.log('info', message, metadata);
  }

  success(message: string, metadata?: any): void {
    this.log('success', message, metadata);
  }

  warn(message: string, metadata?: any): void {
    this.log('warn', message, metadata);
  }

  error(message: string, metadata?: any): void {
    this.log('error', message, metadata);
  }

  // Configuration methods
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  setSilent(silent: boolean): void {
    this.config.silent = silent;
  }

  setUseColor(useColor: boolean): void {
    this.config.useColor = useColor;
  }

  // Listener management
  addListener(listener: LogListener): () => void {
    this.config.listeners.push(listener);
    // Return a function to remove the listener
    return () => {
      const index = this.config.listeners.indexOf(listener);
      if (index > -1) {
        this.config.listeners.splice(index, 1);
      }
    };
  }

  removeAllListeners(): void {
    this.config.listeners = [];
  }

  // Test utilities
  getHistory(): LogEntry[] {
    return [...this.logHistory];
  }

  clearHistory(): void {
    this.logHistory = [];
  }

  getLastLog(): LogEntry | undefined {
    return this.logHistory[this.logHistory.length - 1];
  }

  hasLogged(level: LogLevel, message: string): boolean {
    return this.logHistory.some(
      entry => entry.level === level && entry.message.includes(message)
    );
  }

  // Utility methods
  bold(text: string): string {
    return this.config.useColor ? chalk.bold(text) : text;
  }

  header(text: string): void {
    this.info(this.bold(`=== ${text} ===`));
  }

  section(title: string, content: string): void {
    this.info(this.bold(title));
    this.info(content);
  }

  // Group logging
  group(label: string): void {
    this.info(this.bold(`▼ ${label}`));
  }

  groupEnd(): void {
    // In a more advanced implementation, we could track indentation
  }

  // Table logging
  table(data: any[], columns?: string[]): void {
    if (!data.length) return;
    
    // Simple table implementation
    const keys = columns || Object.keys(data[0]);
    const header = keys.join(' | ');
    const separator = keys.map(() => '---').join(' | ');
    
    this.info(header);
    this.info(separator);
    
    data.forEach(row => {
      const values = keys.map(key => String(row[key] || '')).join(' | ');
      this.info(values);
    });
  }
}

// Export singleton instance as a getter to always get the current instance
export const getLogger = () => EnhancedLogger.getInstance();

// For backward compatibility and ease of use, create a proxy that delegates to getInstance
export const logger = new Proxy({} as EnhancedLogger, {
  get(_, prop) {
    const instance = EnhancedLogger.getInstance();
    return (instance as any)[prop];
  }
});

// Export for testing
export const resetLogger = () => {
  // Clear the singleton instance to force recreation
  (EnhancedLogger as any).instance = undefined;
  // This will cause the next getInstance() call to create a new instance
  // that reads the current environment variables
};
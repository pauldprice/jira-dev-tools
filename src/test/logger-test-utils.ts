import { logger, LogLevel, LogEntry } from '../utils/enhanced-logger';

export class LoggerTestUtils {
  private removeListener?: () => void;
  private logs: LogEntry[] = [];

  /**
   * Start capturing logs for testing
   */
  startCapture(): void {
    this.logs = [];
    this.removeListener = logger.addListener((level, message, metadata) => {
      this.logs.push({
        level,
        message,
        timestamp: new Date(),
        metadata,
      });
    });
  }

  /**
   * Stop capturing logs
   */
  stopCapture(): void {
    if (this.removeListener) {
      this.removeListener();
      this.removeListener = undefined;
    }
  }

  /**
   * Get all captured logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Check if a specific message was logged
   */
  hasLoggedMessage(message: string, level?: LogLevel): boolean {
    return this.logs.some(log => 
      log.message.includes(message) && 
      (!level || log.level === level)
    );
  }

  /**
   * Get the last log entry
   */
  getLastLog(): LogEntry | undefined {
    return this.logs[this.logs.length - 1];
  }

  /**
   * Clear captured logs
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Assert that a specific message was logged
   */
  expectLogged(message: string, level?: LogLevel): void {
    const found = this.hasLoggedMessage(message, level);
    if (!found) {
      const levelStr = level ? ` at level ${level}` : '';
      throw new Error(`Expected message "${message}"${levelStr} to be logged, but it wasn't`);
    }
  }

  /**
   * Assert that a specific message was NOT logged
   */
  expectNotLogged(message: string, level?: LogLevel): void {
    const found = this.hasLoggedMessage(message, level);
    if (found) {
      const levelStr = level ? ` at level ${level}` : '';
      throw new Error(`Expected message "${message}"${levelStr} NOT to be logged, but it was`);
    }
  }

  /**
   * Get a summary of logged messages
   */
  getSummary(): Record<LogLevel, number> {
    const summary: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      success: 0,
    };

    this.logs.forEach(log => {
      summary[log.level]++;
    });

    return summary;
  }
}

// Jest matchers for logger
export const loggerMatchers = {
  toHaveLogged(received: LoggerTestUtils, message: string, level?: LogLevel) {
    const pass = received.hasLoggedMessage(message, level);
    const levelStr = level ? ` at level ${level}` : '';
    
    return {
      pass,
      message: () =>
        pass
          ? `expected not to have logged "${message}"${levelStr}`
          : `expected to have logged "${message}"${levelStr}`,
    };
  },

  toHaveLoggedTimes(received: LoggerTestUtils, count: number, level?: LogLevel) {
    const logs = level ? received.getLogsByLevel(level) : received.getLogs();
    const actualCount = logs.length;
    const pass = actualCount === count;
    const levelStr = level ? ` ${level}` : '';
    
    return {
      pass,
      message: () =>
        pass
          ? `expected not to have logged ${count}${levelStr} messages`
          : `expected to have logged ${count}${levelStr} messages, but logged ${actualCount}`,
    };
  },
};

// TypeScript declarations
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveLogged(message: string, level?: LogLevel): R;
      toHaveLoggedTimes(count: number, level?: LogLevel): R;
    }
  }
}
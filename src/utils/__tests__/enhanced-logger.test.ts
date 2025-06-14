import { logger, resetLogger } from '../enhanced-logger';
import { LoggerTestUtils, loggerMatchers } from '../../test/logger-test-utils';

// Extend Jest matchers
expect.extend(loggerMatchers);

describe('EnhancedLogger', () => {
  let loggerTest: LoggerTestUtils;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    resetLogger();
    loggerTest = new LoggerTestUtils();
    
    // Create fresh spies for each test
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    
    // Reset logger to default state for each test
    logger.setSilent(false);
    logger.setLevel('info');
    logger.clearHistory();
    logger.removeAllListeners();
  });

  afterEach(() => {
    loggerTest.stopCapture();
    jest.restoreAllMocks();
    resetLogger();
  });

  describe('Logging Methods', () => {
    it('should log info messages', () => {
      loggerTest.startCapture();
      
      logger.info('Test info message');
      
      expect(loggerTest).toHaveLogged('Test info message', 'info');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test info message'));
    });

    it('should log error messages', () => {
      loggerTest.startCapture();
      
      logger.error('Test error message');
      
      expect(loggerTest).toHaveLogged('Test error message', 'error');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('✗ Test error message'));
    });

    it('should log warning messages', () => {
      loggerTest.startCapture();
      
      logger.warn('Test warning message');
      
      expect(loggerTest).toHaveLogged('Test warning message', 'warn');
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('⚠ Test warning message'));
    });

    it('should log success messages', () => {
      loggerTest.startCapture();
      
      logger.success('Test success message');
      
      expect(loggerTest).toHaveLogged('Test success message', 'success');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Test success message'));
    });

    it('should log debug messages when level is debug', () => {
      logger.setLevel('debug');
      loggerTest.startCapture();
      
      logger.debug('Test debug message');
      
      expect(loggerTest).toHaveLogged('Test debug message', 'debug');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[DEBUG] Test debug message'));
    });

    // Test moved to enhanced-logger-console.test.ts
  });

  describe('Log Levels', () => {
    // Tests moved to enhanced-logger-console.test.ts
  });

  describe('Silent Mode', () => {
    // Tests moved to enhanced-logger-console.test.ts
  });

  describe('Listeners', () => {
    it('should notify listeners of log events', () => {
      const listener = jest.fn();
      const removeListener = logger.addListener(listener);
      
      logger.info('Test message', { extra: 'data' });
      
      expect(listener).toHaveBeenCalledWith('info', 'Test message', { extra: 'data' });
      
      // Remove listener
      removeListener();
      listener.mockClear();
      
      logger.info('Another message');
      expect(listener).not.toHaveBeenCalled();
    });

    it('should support multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      logger.addListener(listener1);
      logger.addListener(listener2);
      
      logger.info('Test message');
      
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      
      logger.removeAllListeners();
    });
  });

  describe('History', () => {
    it('should maintain log history', () => {
      logger.clearHistory();
      
      logger.info('First message');
      logger.error('Second message');
      
      const history = logger.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].message).toBe('First message');
      expect(history[1].message).toBe('Second message');
    });

    it('should check if message was logged', () => {
      logger.clearHistory();
      
      logger.info('Specific message');
      
      expect(logger.hasLogged('info', 'Specific message')).toBe(true);
      expect(logger.hasLogged('error', 'Specific message')).toBe(false);
      expect(logger.hasLogged('info', 'Different message')).toBe(false);
    });
  });

  describe('Formatting', () => {
    // Test moved to enhanced-logger-console.test.ts

    it('should disable colors when appropriate', () => {
      process.env.NO_COLOR = 'true';
      resetLogger();
      
      logger.setSilent(false);
      logger.info('No color message');
      
      // Should not contain ANSI color codes
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).not.toMatch(/\x1b\[\d+m/);
      
      delete process.env.NO_COLOR;
    });
  });

  describe('Utility Methods', () => {
    it('should format tables', () => {
      loggerTest.startCapture();
      
      const data = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ];
      
      logger.table(data);
      
      expect(loggerTest).toHaveLogged('name | age');
      expect(loggerTest).toHaveLogged('--- | ---');
      expect(loggerTest).toHaveLogged('Alice | 30');
      expect(loggerTest).toHaveLogged('Bob | 25');
    });

    it('should format headers', () => {
      loggerTest.startCapture();
      
      logger.header('Test Section');
      
      expect(loggerTest).toHaveLogged('=== Test Section ===');
    });
  });

  describe('Test Utilities', () => {
    it('should provide test assertions', () => {
      loggerTest.startCapture();
      
      logger.info('Expected message');
      
      // Should not throw
      loggerTest.expectLogged('Expected message');
      
      // Should throw
      expect(() => loggerTest.expectNotLogged('Expected message')).toThrow();
    });

    it('should provide log summary', () => {
      loggerTest.startCapture();
      
      logger.info('Info 1');
      logger.info('Info 2');
      logger.error('Error 1');
      logger.warn('Warn 1');
      
      const summary = loggerTest.getSummary();
      
      expect(summary.info).toBe(2);
      expect(summary.error).toBe(1);
      expect(summary.warn).toBe(1);
      expect(summary.debug).toBe(0);
      expect(summary.success).toBe(0);
    });
  });
});
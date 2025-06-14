import { logger, resetLogger } from '../enhanced-logger';
import { LoggerTestUtils } from '../../test/logger-test-utils';

describe('EnhancedLogger Console Output', () => {
  let loggerTest: LoggerTestUtils;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Clean environment
    delete process.env.LOG_TIMESTAMPS;
    delete process.env.NO_COLOR;
    delete process.env.LOG_LEVEL;
    
    // Reset logger
    resetLogger();
    
    // Create test utils
    loggerTest = new LoggerTestUtils();
    
    // Create fresh spies - MUST be after resetLogger
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Configure logger for testing
    logger.setSilent(false);
    logger.setLevel('info');
    logger.clearHistory();
    logger.removeAllListeners();
  });

  afterEach(() => {
    loggerTest.stopCapture();
    jest.restoreAllMocks();
  });

  it('should not log debug messages to console when level is info', () => {
    logger.setLevel('info');
    loggerTest.startCapture();
    
    logger.debug('Test debug message');
    
    // Should be in history but not console
    expect(loggerTest.hasLoggedMessage('Test debug message', 'debug')).toBe(true);
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('should respect log level hierarchy', () => {
    loggerTest.startCapture();
    
    // Set to warn level
    logger.setLevel('warn');
    
    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');
    
    // Only warn and error should be output to console
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    
    // But all should be in history
    expect(loggerTest.getLogs()).toHaveLength(4);
  });

  it('should not output to console when silent', () => {
    logger.setSilent(true);
    loggerTest.startCapture();
    
    logger.info('Silent message');
    logger.error('Silent error');
    
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    
    // But should still be in history
    expect(loggerTest.hasLoggedMessage('Silent message')).toBe(true);
    expect(loggerTest.hasLoggedMessage('Silent error')).toBe(true);
  });

  it('should include timestamps when enabled', () => {
    process.env.LOG_TIMESTAMPS = 'true';
    
    logger.info('Timestamped message');
    
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T.*\] Timestamped message/)
    );
  });
});
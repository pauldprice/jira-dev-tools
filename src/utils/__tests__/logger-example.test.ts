import { logger } from '../enhanced-logger';
import { LoggerTestUtils } from '../../test/logger-test-utils';

// Example of testing code that uses the logger
function processData(data: any[]): void {
  logger.info(`Processing ${data.length} items`);
  
  data.forEach((item, index) => {
    try {
      if (!item.id) {
        logger.warn(`Item at index ${index} has no ID`);
        return; // Skip processing items without ID
      }
      
      // Process item...
      logger.debug(`Processed item ${item.id}`);
    } catch (error) {
      logger.error(`Failed to process item at index ${index}: ${error}`);
    }
  });
  
  logger.success(`Completed processing ${data.length} items`);
}

describe('Logger Usage Example', () => {
  let loggerTest: LoggerTestUtils;

  beforeEach(() => {
    loggerTest = new LoggerTestUtils();
    loggerTest.startCapture();
  });

  afterEach(() => {
    loggerTest.stopCapture();
  });

  it('should log processing information', () => {
    const testData = [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
      { name: 'Item without ID' },
    ];

    processData(testData);

    // Check that expected logs were created
    expect(loggerTest).toHaveLogged('Processing 3 items', 'info');
    expect(loggerTest).toHaveLogged('Item at index 2 has no ID', 'warn');
    expect(loggerTest).toHaveLogged('Completed processing 3 items', 'success');
    
    // Check debug logs
    expect(loggerTest).toHaveLogged('Processed item 1', 'debug');
    expect(loggerTest).toHaveLogged('Processed item 2', 'debug');
    
    // Check counts
    expect(loggerTest).toHaveLoggedTimes(2, 'debug');
    expect(loggerTest).toHaveLoggedTimes(1, 'warn');
    
    // Get summary
    const summary = loggerTest.getSummary();
    expect(summary.info).toBe(1);
    expect(summary.warn).toBe(1);
    expect(summary.success).toBe(1);
    expect(summary.debug).toBe(2);
    expect(summary.error).toBe(0);
  });

  it('should capture error logs', () => {
    const badData = [
      { id: 1, name: 'Good item' },
      null, // This will cause an error
    ];

    processData(badData);

    expect(loggerTest).toHaveLogged('Failed to process item at index 1:', 'error');
    
    // Verify the error was logged
    const errorLogs = loggerTest.getLogsByLevel('error');
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0].message).toContain('Failed to process item');
  });

  it('should allow inspection of log history', () => {
    processData([{ id: 1 }]);

    const history = loggerTest.getLogs();
    
    // First log should be the info message
    expect(history[0].level).toBe('info');
    expect(history[0].message).toBe('Processing 1 items');
    
    // Last log should be the success message  
    const lastLog = loggerTest.getLastLog();
    expect(lastLog?.level).toBe('success');
    expect(lastLog?.message).toBe('Completed processing 1 items');
  });
});
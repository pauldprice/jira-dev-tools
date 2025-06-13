// Jest setup file
import '@testing-library/jest-dom';
import { logger } from '../utils/enhanced-logger';
import { loggerMatchers } from './logger-test-utils';

// Extend Jest with logger matchers
expect.extend(loggerMatchers);

// Mock environment variables for tests
process.env.NODE_ENV = 'test';

// Configure logger for tests
beforeAll(() => {
  // Set logger to silent mode by default in tests
  logger.setSilent(true);
  logger.setLevel('debug'); // Capture all levels in history
});

// Clear logger history between tests
beforeEach(() => {
  logger.clearHistory();
});

// Suppress direct console usage (for legacy code)
const originalConsole = { ...console };

beforeAll(() => {
  // Suppress console output during tests
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  
  // Suppress specific console.error messages
  const originalError = console.error;
  console.error = (...args: any[]) => {
    // Suppress jsdom CSS parsing errors
    if (args[0]?.toString().includes('Could not parse CSS stylesheet')) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  // Restore original console
  Object.assign(console, originalConsole);
});

// Global test utilities
global.testUtils = {
  // Helper to restore console for specific tests
  restoreConsole: () => {
    Object.assign(console, originalConsole);
  },
  
  // Helper to create mock responses
  createMockResponse: (data: any, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

// Add custom matchers
expect.extend({
  toBeValidDate(received) {
    const pass = received instanceof Date && !isNaN(received.getTime());
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid date`
          : `expected ${received} to be a valid date`,
    };
  },
});

// TypeScript declarations for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidDate(): R;
    }
  }
  
  var testUtils: {
    restoreConsole: () => void;
    createMockResponse: (data: any, status?: number) => Response;
  };
}
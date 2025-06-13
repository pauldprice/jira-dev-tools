// Jest setup file
import '@testing-library/jest-dom';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';

// Suppress console output during tests unless explicitly needed
const originalConsole = { ...console };

beforeAll(() => {
  // Suppress console.log and console.info during tests
  console.log = jest.fn();
  console.info = jest.fn();
  // Keep console.error and console.warn for debugging
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
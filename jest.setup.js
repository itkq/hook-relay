// Test environment setup
// Timeout configuration
jest.setTimeout(10000);

// Global mock configuration
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock process.exit
process.exit = jest.fn();

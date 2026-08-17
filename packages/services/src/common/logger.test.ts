import { describe, it, expect, beforeEach } from 'bun:test';
import { createRootLogger, createChildLogger, getLogger, resetLogger } from './logger';

describe('Logger', () => {
  beforeEach(() => {
    resetLogger();
  });

  it('should create a root logger', () => {
    const logger = createRootLogger();
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  it('should return same logger instance on multiple getLogger calls', () => {
    const logger1 = getLogger();
    const logger2 = getLogger();
    expect(logger1).toBe(logger2);
  });

  it('should create child logger with module name', () => {
    const childLogger = createChildLogger('test-module');
    expect(childLogger).toBeDefined();
    expect(typeof childLogger.info).toBe('function');
  });

  it('should create child logger with context', () => {
    const childLogger = createChildLogger('test-module', {
      userId: 'user-123',
      requestId: 'req-456',
    });
    expect(childLogger).toBeDefined();
  });

  it('should support all log levels', () => {
    const logger = getLogger();
    expect(typeof logger.trace).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.fatal).toBe('function');
  });
});

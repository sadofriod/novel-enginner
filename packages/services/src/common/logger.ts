import pino from 'pino';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'trace';

const LOG_LEVEL = (process.env['LOG_LEVEL'] ?? 'info') as LogLevel;

const isDevelopment = process.env['NODE_ENV'] !== 'production';

/**
 * Create a root logger instance for the backend
 * Supports structured logging with proper levels and formatting
 */
export function createRootLogger(): pino.Logger {
  const transport = isDevelopment
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      })
    : undefined;

  const baseLogger = pino(
    {
      level: LOG_LEVEL,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    transport,
  );

  return baseLogger;
}

/**
 * Get or create a logger instance
 * Should be called once per module
 */
let rootLogger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (rootLogger === null) {
    rootLogger = createRootLogger();
  }
  return rootLogger;
}

/**
 * Create a child logger for a specific module
 * @param name - Module name or identifier
 * @param context - Additional context to attach to all log entries
 */
export function createChildLogger(
  name: string,
  context?: Record<string, unknown>,
): pino.Logger {
  const logger = getLogger().child({
    module: name,
    ...context,
  });
  return logger;
}

/**
 * Reset the logger (useful for testing)
 */
export function resetLogger(): void {
  rootLogger = null;
}

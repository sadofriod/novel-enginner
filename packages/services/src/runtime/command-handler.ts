/**
 * Command handling entry point: envelope validation + the shared command
 * execution path used by HTTP and CLI entry points. Aggregates the per-concern
 * command modules so consumers keep a single stable import surface.
 */
export * from './commands/types';
export * from './commands/envelope-validation';
export * from './commands/handle';

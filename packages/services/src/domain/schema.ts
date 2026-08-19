/**
 * Domain schema entry point. Aggregates the per-aggregate zod schemas
 * (domain/schemas/*) plus the registry schemas and schema-level type aliases.
 * Consumers import schemas from here (or from `../domain`) as the stable
 * domain contract surface.
 */
export * from './schemas/common';
export * from './schemas/entities';
export * from './schemas/canonical';
export * from './schemas/chapter';
export * from './schemas/proposal';
export * from './schemas/review';
export * from './schemas/proposal-review';
export * from './registry-schemas';
export * from './schema-types';

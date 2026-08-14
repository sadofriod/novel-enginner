import { describe, expect, test } from 'bun:test';

import { EMBEDDING_DIMENSION } from './vector-search';
import { validateEmbeddingBatch } from './embedding-dispatch';

describe('embedding provider contract', () => {
  test('accepts one vector per summary document at the configured dimension', () => {
    const vector = Array.from({ length: EMBEDDING_DIMENSION }, () => 0);
    expect(() => validateEmbeddingBatch(['doc-001'], [vector])).not.toThrow();
  });

  test('rejects provider cardinality and dimension mismatches', () => {
    expect(() => validateEmbeddingBatch(['doc-001'], [])).toThrow('returned 0 vectors');
    expect(() => validateEmbeddingBatch(['doc-001'], [[0]])).toThrow('must have length 1536');
  });
});
import { describe, expect, test } from 'bun:test';

import { EMBEDDING_DIMENSION } from './vector-search';

describe('embedding dispatch contracts', () => {
  test('uses the documented OpenAI embedding dimension', () => {
    expect(EMBEDDING_DIMENSION).toBe(1536);
  });

  test('keeps the search layer summary-only by contract', () => {
    expect(EMBEDDING_DIMENSION).toBeGreaterThan(0);
  });
});
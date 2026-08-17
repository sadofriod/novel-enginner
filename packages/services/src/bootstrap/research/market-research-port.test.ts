import { describe, expect, test } from 'bun:test';

import { evaluateSourcePolicy } from './market-research-port';

describe('evaluateSourcePolicy', () => {
  test('marks permissive hosts as allowed', () => {
    const policy = evaluateSourcePolicy({ url: 'https://archive.org/details/example', title: 'Source', summary: 'summary' });
    expect(policy).toEqual({ license: 'cc-by', copyrightBoundary: 'allowed' });
  });

  test('blocks restricted hosts', () => {
    const policy = evaluateSourcePolicy({ url: 'https://example.com/leak', title: 'Source', summary: 'summary' });
    expect(policy).toEqual({ license: 'unknown', copyrightBoundary: 'blocked' });
  });

  test('reviews unknown hosts before they can enter canonical content', () => {
    const policy = evaluateSourcePolicy({ url: 'https://other.example.org/post', title: 'Source', summary: 'summary' });
    expect(policy).toEqual({ license: 'unknown', copyrightBoundary: 'review-required' });
  });
});

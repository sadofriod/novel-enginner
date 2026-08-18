import { describe, expect, test } from 'bun:test';

import { describeError } from './errors';

describe('describeError', () => {
  test('extracts message and stack from an Error', () => {
    const detail = describeError(new Error('boom'));
    expect(detail.message).toBe('boom');
    expect(detail.stack).toContain('boom');
  });

  test('stringifies non-Error caught values', () => {
    expect(describeError('oops').message).toBe('oops');
    expect(describeError(42).message).toBe('42');
  });
});

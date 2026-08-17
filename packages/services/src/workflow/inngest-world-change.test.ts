import { describe, expect, test } from 'bun:test';

import { worldChangeFunction } from './inngest-world-change';

describe('worldChangeFunction', () => {
  test('registers under the documented workflow id', () => {
    expect(worldChangeFunction.id()).toBe('world-change-workflow');
  });
});

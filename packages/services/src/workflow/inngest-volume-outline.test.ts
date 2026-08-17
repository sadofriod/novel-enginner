import { describe, expect, test } from 'bun:test';

import { volumeOutlineFunction } from './inngest-volume-outline';

describe('volumeOutlineFunction', () => {
  test('registers under the documented workflow id', () => {
    expect(volumeOutlineFunction.id()).toBe('volume-outline-workflow');
  });
});

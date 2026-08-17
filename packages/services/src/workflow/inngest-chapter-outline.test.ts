import { describe, expect, test } from 'bun:test';

import { chapterOutlineFunction } from './inngest-chapter-outline';

describe('chapterOutlineFunction', () => {
  test('registers under the documented workflow id', () => {
    expect(chapterOutlineFunction.id()).toBe('chapter-outline-workflow');
  });
});

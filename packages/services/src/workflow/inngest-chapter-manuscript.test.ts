import { describe, expect, test } from 'bun:test';

import { chapterManuscriptFunction } from './inngest-chapter-manuscript';

describe('chapterManuscriptFunction', () => {
  test('registers under the documented workflow id', () => {
    expect(chapterManuscriptFunction.id()).toBe('chapter-manuscript-workflow');
  });
});

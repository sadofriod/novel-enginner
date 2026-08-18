import { describe, expect, test } from 'bun:test';

import { generateManuscript } from './drafter';
import { outlineChapter } from './plot-planner';
import { resolveOptimizeAgent } from './resolve-optimize-agent';
import { generateWorldState } from './world-builder';

describe('resolveOptimizeAgent', () => {
  test('maps manuscript optimization to the drafter', () => {
    expect(resolveOptimizeAgent('chapter-manuscript')).toBe(generateManuscript);
  });

  test('maps outline optimization to the plot planner', () => {
    expect(resolveOptimizeAgent('chapter-outline')).toBe(outlineChapter);
    expect(resolveOptimizeAgent('volume-outline')).toBe(outlineChapter);
  });

  test('maps world state optimization to the world builder', () => {
    expect(resolveOptimizeAgent('world-foundation')).toBe(generateWorldState);
    expect(resolveOptimizeAgent('story-blueprint')).toBe(generateWorldState);
  });

  test('returns undefined for non-optimizable artifact types', () => {
    expect(resolveOptimizeAgent('character-update')).toBeUndefined();
    expect(resolveOptimizeAgent('project-brief')).toBeUndefined();
    expect(resolveOptimizeAgent('world-change')).toBeUndefined();
  });
});

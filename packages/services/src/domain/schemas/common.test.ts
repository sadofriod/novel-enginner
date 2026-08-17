import { describe, expect, test } from 'bun:test';

import {
  ConfidenceSchema,
  EntityVersionRefSchema,
  NonEmptyStringSchema,
  PositiveIntegerSchema,
  ScoreSchema,
  StableIdSchema,
} from './common';

describe('common schema primitives', () => {
  test('StableIdSchema accepts lowercase kebab-case ids and rejects invalid ones', () => {
    expect(StableIdSchema.parse('chapter-0041-outline')).toBe('chapter-0041-outline');
    expect(StableIdSchema.safeParse('Chapter Outline').success).toBe(false);
    expect(StableIdSchema.safeParse('').success).toBe(false);
    expect(StableIdSchema.safeParse('has_underscore').success).toBe(false);
  });

  test('NonEmptyStringSchema trims and rejects empty strings', () => {
    expect(NonEmptyStringSchema.parse('  title  ')).toBe('title');
    expect(NonEmptyStringSchema.safeParse('   ').success).toBe(false);
  });

  test('PositiveIntegerSchema rejects zero, negatives, and fractions', () => {
    expect(PositiveIntegerSchema.parse(3)).toBe(3);
    expect(PositiveIntegerSchema.safeParse(0).success).toBe(false);
    expect(PositiveIntegerSchema.safeParse(-1).success).toBe(false);
    expect(PositiveIntegerSchema.safeParse(1.5).success).toBe(false);
  });

  test('ScoreSchema constrains to 0..100 integer', () => {
    expect(ScoreSchema.parse(100)).toBe(100);
    expect(ScoreSchema.safeParse(101).success).toBe(false);
    expect(ScoreSchema.safeParse(-1).success).toBe(false);
  });

  test('ConfidenceSchema constrains to 0..1', () => {
    expect(ConfidenceSchema.parse(0.5)).toBe(0.5);
    expect(ConfidenceSchema.safeParse(1.5).success).toBe(false);
  });

  test('EntityVersionRefSchema requires stable ids for both fields', () => {
    expect(
      EntityVersionRefSchema.parse({ entityId: 'fact-1', version: 'v-1' }),
    ).toEqual({ entityId: 'fact-1', version: 'v-1' });
    expect(EntityVersionRefSchema.safeParse({ entityId: 'x', version: '' }).success).toBe(false);
  });
});

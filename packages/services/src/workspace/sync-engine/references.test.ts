import { describe, expect, test } from 'bun:test';

import { validateChapterContracts, validateEntityReferences } from './references';

function entity(
  path: string,
  kind: string,
  data: Record<string, unknown>,
): { path: string; kind: string; data: unknown; contentHash: string } {
  return { path, kind, data, contentHash: 'h' };
}

describe('validateEntityReferences', () => {
  test('reports a dangling reference to a missing entity kind', () => {
    const entities = new Map([
      ['a.md', entity('a.md', 'chapter-outline', { id: 'chapter-1', volumeId: 'missing-volume' })],
    ]);

    const errors = validateEntityReferences(entities);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe('a.md');
    expect(errors[0]?.reason).toContain('missing-volume');
  });

  test('accepts references that resolve to a known target', () => {
    const entities = new Map([
      ['a.md', entity('a.md', 'chapter-outline', { id: 'chapter-1', volumeId: 'volume-1' })],
      ['b.md', entity('b.md', 'volume', { id: 'volume-1' })],
    ]);

    expect(validateEntityReferences(entities)).toEqual([]);
  });

  test('resolves dotted field paths and arrays', () => {
    const entities = new Map([
      [
        'a.md',
        entity('a.md', 'chapter-outline', {
          id: 'chapter-1',
          sceneSkeleton: [{ locationId: 'location-9', participantCharacterIds: ['char-1'] }],
        }),
      ],
      ['b.md', entity('b.md', 'location', { id: 'location-9' })],
      ['c.md', entity('c.md', 'character', { id: 'char-1' })],
    ]);

    expect(validateEntityReferences(entities)).toEqual([]);
  });
});

describe('validateChapterContracts', () => {
  test('rejects a manuscript whose displayTitle differs from the outline', () => {
    const entities = new Map([
      [
        'outline.md',
        entity('outline.md', 'chapter-outline', {
          id: 'chapter-1',
          chapterNumber: 42,
          displayTitle: 'First Tide',
          status: 'approved',
        }),
      ],
      [
        'manuscript.md',
        entity('manuscript.md', 'chapter-manuscript', {
          id: 'manuscript-1',
          chapterNumber: 42,
          basedOnOutlineId: 'chapter-1',
          displayTitle: 'Second Tide',
        }),
      ],
    ]);

    const errors = validateChapterContracts(entities);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.reason).toContain('displayTitle');
  });

  test('rejects a manuscript bound to a non-approved outline', () => {
    const entities = new Map([
      [
        'outline.md',
        entity('outline.md', 'chapter-outline', {
          id: 'chapter-1',
          chapterNumber: 42,
          status: 'draft',
        }),
      ],
      [
        'manuscript.md',
        entity('manuscript.md', 'chapter-manuscript', {
          id: 'manuscript-1',
          chapterNumber: 42,
          basedOnOutlineId: 'chapter-1',
        }),
      ],
    ]);

    const errors = validateChapterContracts(entities);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.reason).toContain('approved outline');
  });

  test('accepts a manuscript matching the approved outline', () => {
    const entities = new Map([
      [
        'outline.md',
        entity('outline.md', 'chapter-outline', {
          id: 'chapter-1',
          chapterNumber: 42,
          displayTitle: 'First Tide',
          status: 'approved',
        }),
      ],
      [
        'manuscript.md',
        entity('manuscript.md', 'chapter-manuscript', {
          id: 'manuscript-1',
          chapterNumber: 42,
          basedOnOutlineId: 'chapter-1',
          displayTitle: 'First Tide',
        }),
      ],
    ]);

    expect(validateChapterContracts(entities)).toEqual([]);
  });
});

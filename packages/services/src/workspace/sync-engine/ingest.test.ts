import { describe, expect, test } from 'bun:test';

import { ingestCanonicalFiles, nextSnapshotId, resolveValidity } from './ingest';

describe('nextSnapshotId', () => {
  test('increments the numeric sequence from the previous id', () => {
    expect(nextSnapshotId({ snapshotId: 'snap-0001', entities: new Map() })).toBe('snap-0002');
    expect(nextSnapshotId(undefined)).toBe('snap-0001');
  });

  test('starts at snap-0001 when the previous id has no numeric suffix', () => {
    expect(nextSnapshotId({ snapshotId: 'snap-first', entities: new Map() })).toBe('snap-0001');
  });
});

describe('resolveValidity', () => {
  test('is invalid when there are errors, regardless of changes', () => {
    expect(resolveValidity([{ path: 'a.md', reason: 'boom' }], [])).toBe('invalid');
    expect(resolveValidity([{ path: 'a.md', reason: 'boom' }], ['a.md'])).toBe('invalid');
  });

  test('is dirty when nothing failed but something changed', () => {
    expect(resolveValidity([], ['a.md'])).toBe('dirty');
  });

  test('is clean when nothing failed and nothing changed', () => {
    expect(resolveValidity([], [])).toBe('clean');
  });
});

describe('ingestCanonicalFiles', () => {
  const CHARACTER = `---
id: char-1
name: Hero
status: active
coreMotivation: survive
worldview: pragmatic
techLevel: tier-1
---

# Summary

A character.
`;

  test('ingests valid canonical files and skips unmatched paths', () => {
    const entities = new Map();
    const result = ingestCanonicalFiles(
      [
        { path: 'state/characters/char-1.md', content: CHARACTER },
        { path: 'state/README.md', content: '# hello' },
      ],
      entities,
    );

    expect(result.errors).toEqual([]);
    expect(result.changedPaths).toEqual(['state/characters/char-1.md']);
    expect(entities.has('state/characters/char-1.md')).toBe(true);
    expect(entities.has('state/README.md')).toBe(false);
  });

  test('records validation errors instead of throwing', () => {
    const entities = new Map();
    const result = ingestCanonicalFiles(
      [{ path: 'state/characters/char-1.md', content: 'not: valid: yaml: [' }],
      entities,
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.path).toBe('state/characters/char-1.md');
  });
});

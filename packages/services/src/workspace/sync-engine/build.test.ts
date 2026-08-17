import { describe, expect, test } from 'bun:test';

import { isWriteBlocked, reSyncState } from './build';

const CHARACTER = `---
id: char-1
name: Hero
status: active
coreMotivation: survive
worldview: pragmatic
techLevel: tier-1
---

# Summary

A stable character.
`;

describe('reSyncState', () => {
  test('ingests valid new files as a dirty snapshot on first sync', () => {
    const result = reSyncState([{ path: 'state/characters/char-1.md', content: CHARACTER }]);

    expect(result.validity).toBe('dirty');
    expect(result.errors).toEqual([]);
    expect(result.snapshot.entities.get('state/characters/char-1.md')?.kind).toBe('character');
    expect(result.snapshot.snapshotId).toBe('snap-0001');
  });

  test('produces the same snapshot id when nothing changes between syncs', () => {
    const files = [{ path: 'state/characters/char-1.md', content: CHARACTER }];
    const first = reSyncState(files);
    const second = reSyncState(files, first.snapshot);

    expect(second.snapshot.snapshotId).toBe(first.snapshot.snapshotId);
    expect(second.validity).toBe('clean');
    expect(second.changedPaths).toEqual([]);
  });

  test('becomes dirty when a canonical file changes', () => {
    const files = [{ path: 'state/characters/char-1.md', content: CHARACTER }];
    const first = reSyncState(files);
    const changed = reSyncState(
      [{ path: 'state/characters/char-1.md', content: CHARACTER.replace('survive', 'thrive') }],
      first.snapshot,
    );

    expect(changed.validity).toBe('dirty');
    expect(changed.changedPaths).toEqual(['state/characters/char-1.md']);
  });

  test('becomes invalid and keeps the last good snapshot when a file breaks', () => {
    const files = [{ path: 'state/characters/char-1.md', content: CHARACTER }];
    const first = reSyncState(files);
    const broken = reSyncState(
      [{ path: 'state/characters/char-1.md', content: 'broken: [' }],
      first.snapshot,
    );

    expect(broken.validity).toBe('invalid');
    expect(broken.errors).toHaveLength(1);
  });
});

describe('isWriteBlocked', () => {
  test('blocks writes when the workspace is dirty or invalid', () => {
    expect(isWriteBlocked('dirty')).toBe(true);
    expect(isWriteBlocked('invalid')).toBe(true);
    expect(isWriteBlocked('clean')).toBe(false);
  });
});

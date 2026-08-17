import { describe, expect, test } from 'bun:test';

import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import { dedupeEdges, entitiesOfKind } from './graph-util';

function snapshotWith(kinds: readonly { readonly path: string; readonly kind: string }[]): WorkspaceSnapshot {
  return {
    snapshotId: 'snap-test',
    entities: new Map(
      kinds.map((entry) => [
        entry.path,
        { path: entry.path, kind: entry.kind, data: {}, contentHash: 'h' },
      ]),
    ),
  };
}

describe('entitiesOfKind', () => {
  test('returns only entities of the requested kind', () => {
    const snapshot = snapshotWith([
      { path: 'a.md', kind: 'character' },
      { path: 'b.md', kind: 'faction' },
      { path: 'c.md', kind: 'character' },
    ]);

    const result = entitiesOfKind(snapshot, 'character');

    expect(result.map((entity) => entity.path)).toEqual(['a.md', 'c.md']);
  });

  test('returns an empty array when no entity matches', () => {
    const snapshot = snapshotWith([{ path: 'a.md', kind: 'character' }]);
    expect(entitiesOfKind(snapshot, 'plot-clue')).toEqual([]);
  });
});

describe('dedupeEdges', () => {
  test('keeps the first occurrence of each edge id and preserves order', () => {
    const edges = [
      { id: 'edge:knows:a:b', type: 'knows' as const, sourceId: 'a', targetId: 'b' },
      { id: 'edge:knows:a:b', type: 'knows' as const, sourceId: 'a', targetId: 'b' },
      { id: 'edge:controls:c:d', type: 'controls' as const, sourceId: 'c', targetId: 'd' },
    ];

    expect(dedupeEdges(edges).map((edge) => edge.id)).toEqual([
      'edge:knows:a:b',
      'edge:controls:c:d',
    ]);
  });

  test('returns an empty array for empty input', () => {
    expect(dedupeEdges([])).toEqual([]);
  });
});

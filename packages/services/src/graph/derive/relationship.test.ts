import { describe, expect, test } from 'bun:test';

import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import { deriveRelationshipGraph } from './relationship';

function snapshotWith(relationshipData: Record<string, unknown>): WorkspaceSnapshot {
  return {
    snapshotId: 'snap-test',
    entities: new Map([
      [
        'state/relationships/rel.md',
        {
          path: 'state/relationships/rel.md',
          kind: 'relationship',
          data: relationshipData,
          contentHash: 'h',
        },
      ],
    ]),
  };
}

describe('deriveRelationshipGraph', () => {
  test('maps known relationType values onto recommended edge types', () => {
    const result = deriveRelationshipGraph(
      snapshotWith({ id: 'rel-1', sourceRef: 'char-a', targetRef: 'char-b', relationType: 'knows' }),
    );

    expect(result.edges).toEqual([
      {
        id: 'edge:knows:char-a:char-b',
        type: 'knows',
        sourceId: 'char-a',
        targetId: 'char-b',
        provenanceRef: 'state/relationships/rel.md',
      },
    ]);
  });

  test('falls back to relates-to for unknown relationType values', () => {
    const result = deriveRelationshipGraph(
      snapshotWith({ id: 'rel-1', sourceRef: 'char-a', targetRef: 'char-b', relationType: 'trades-with' }),
    );

    expect(result.edges[0]?.type).toBe('relates-to');
  });

  test('derives no nodes, only edges', () => {
    const result = deriveRelationshipGraph(
      snapshotWith({ id: 'rel-1', sourceRef: 'char-a', targetRef: 'char-b', relationType: 'controls' }),
    );
    expect(result.nodes).toEqual([]);
  });
});

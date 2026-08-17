import { describe, expect, test } from 'bun:test';

import { toDerivedGraphView } from './graph-adapter';

import type { WorkspaceGraph } from '../../api-types';

describe('toDerivedGraphView', () => {
  test('maps a ready graph into the view shape', () => {
    const graph: WorkspaceGraph = {
      status: 'ready',
      builtFromSnapshotId: 'snap-1',
      nodes: [{ id: 'char-mira', kind: 'Character', label: 'Mira', sourceRef: 'state/characters/char-mira.md' }],
      edges: [{ id: 'e1', type: 'knows', sourceId: 'char-mira', targetId: 'faction-harbor-wardens' }],
    };

    const view = toDerivedGraphView(graph);

    expect(view.status).toBe('ready');
    expect(view.nodes[0]).toEqual({ id: 'char-mira', label: 'Mira', type: 'Character' });
    expect(view.edges[0]).toEqual({ source: 'char-mira', target: 'faction-harbor-wardens', type: 'knows' });
  });

  test('maps not-ready to stale', () => {
    const view = toDerivedGraphView({ status: 'not-ready', nodes: [], edges: [] });

    expect(view.status).toBe('stale');
    expect(view.nodes).toEqual([]);
  });
});

import { describe, expect, test } from 'bun:test';

import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import type { GraphNode } from '../types';
import { buildSearchDocuments } from './search-documents';

const NODES: readonly GraphNode[] = [
  {
    id: 'char-1',
    kind: 'Character',
    label: 'Hero',
    sourceRef: 'state/characters/char.md',
    canonicalKind: 'character',
  },
  {
    id: 'scene-1',
    kind: 'Scene',
    label: 'Breach',
    sourceRef: 'state/chapters/chapter-1.md',
    canonicalKind: 'chapter-outline',
  },
];

function snapshotWithPlanningAnchor(anchor: { readonly id: string; readonly title: string }): WorkspaceSnapshot {
  return {
    snapshotId: 'snap-test',
    entities: new Map([
      [
        'state/planning-anchors/pa.md',
        { path: 'state/planning-anchors/pa.md', kind: 'planning-anchor', data: anchor, contentHash: 'h' },
      ],
    ]),
  };
}

describe('buildSearchDocuments', () => {
  test('produces summary-shaped documents only for summary-eligible node kinds', () => {
    const snapshot = snapshotWithPlanningAnchor({ id: 'pa-1', title: 'First Tide' });
    const documents = buildSearchDocuments(snapshot, NODES);

    const ids = documents.map((document) => document.id);
    expect(ids).toContain('doc:char-1');
    expect(ids).not.toContain('doc:scene-1');
  });

  test('documents carry kind, nodeId, sourceRef, and a stable content hash', () => {
    const snapshot = snapshotWithPlanningAnchor({ id: 'pa-1', title: 'First Tide' });
    const [document] = buildSearchDocuments(snapshot, NODES);

    expect(document).toEqual(
      expect.objectContaining({
        id: 'doc:char-1',
        kind: 'Character',
        nodeId: 'char-1',
        sourceRef: 'state/characters/char.md',
        text: 'Character: Hero',
      }),
    );
    expect(document?.contentHash).toMatch(/^[0-9a-f]+$/);
  });

  test('includes PlanningAnchor documents from the snapshot', () => {
    const snapshot = snapshotWithPlanningAnchor({ id: 'pa-1', title: 'First Tide' });
    const documents = buildSearchDocuments(snapshot, []);

    expect(documents).toEqual([
      expect.objectContaining({
        id: 'doc:pa-1',
        kind: 'PlanningAnchor',
        nodeId: 'pa-1',
        text: 'PlanningAnchor: First Tide',
      }),
    ]);
  });
});

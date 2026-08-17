import { describe, expect, test } from 'bun:test';

import { reSyncState } from '../workspace/sync-engine';
import { buildDerivedGraph } from './derive/build';

const BOOK = `---
id: book-001
title: Test Book
status: active
activeVolumeId: volume-001
latestCanonicalVersion: snap-0001
globalPromises: []
globalConstraints: []
defaultChapterTypePolicy:
  maxConsecutiveSamePrimaryType: 2
---
`;

const VOLUME = `---
id: volume-001
title: Volume One
status: active
sequenceNumber: 1
goal: Test goal
stage: escalation
chapterRoster: []
targetChapterCount: 1
requiredCluePayoffs: []
milestones: [pa-001]
---
`;

const ANCHOR = `---
id: pa-001
kind: milestone
title: Reveal the origin
status: active
ownerRef: volume-001
summary: Reveal the origin
relatedClueIds: []
targetChapterIds: []
---
`;

describe('planning anchor derived search', () => {
  test('indexes planning anchors without adding them to the main graph', () => {
    const result = reSyncState([
      { path: 'state/book/book.md', content: BOOK },
      { path: 'state/volumes/volume-001.md', content: VOLUME },
      { path: 'state/planning-anchors/pa-001.md', content: ANCHOR },
    ]);
    expect(result.errors).toEqual([]);
    const graph = buildDerivedGraph(result.snapshot);

    expect(graph.nodes.some((node) => node.id === 'pa-001')).toBe(false);
    expect(graph.searchDocuments).toContainEqual(expect.objectContaining({ nodeId: 'pa-001', kind: 'PlanningAnchor' }));
  });
});

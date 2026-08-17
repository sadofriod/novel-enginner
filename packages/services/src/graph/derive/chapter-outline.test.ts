import { describe, expect, test } from 'bun:test';

import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import { deriveChapterOutlineGraph } from './chapter-outline';

const OUTLINE = {
  id: 'chapter-1',
  displayTitle: 'First Tide',
  introduceClueIds: ['clue-a'],
  activeClueIds: ['clue-b'],
  resolveClueIds: ['clue-c'],
  sceneSkeleton: [
    {
      id: 'scene-1',
      purpose: 'Breach',
      locationId: 'loc-1',
      participantCharacterIds: ['char-a'],
    },
  ],
};

function snapshotWith(outlineData: Record<string, unknown>): WorkspaceSnapshot {
  return {
    snapshotId: 'snap-test',
    entities: new Map([
      [
        'state/chapters/chapter-1.md',
        { path: 'state/chapters/chapter-1.md', kind: 'chapter-outline', data: outlineData, contentHash: 'h' },
      ],
    ]),
  };
}

describe('deriveChapterOutlineGraph', () => {
  test('derives a Chapter node using displayTitle as label', () => {
    const result = deriveChapterOutlineGraph(snapshotWith(OUTLINE));

    expect(result.nodes).toEqual(
      expect.arrayContaining([
        {
          id: 'chapter-1',
          kind: 'Chapter',
          label: 'First Tide',
          sourceRef: 'state/chapters/chapter-1.md',
          canonicalKind: 'chapter-outline',
        },
      ]),
    );
  });

  test('falls back to the outline id when displayTitle is absent', () => {
    const { displayTitle: _displayTitle, ...withoutTitle } = OUTLINE;
    const result = deriveChapterOutlineGraph(snapshotWith(withoutTitle));

    expect(result.nodes.find((node) => node.id === 'chapter-1')?.label).toBe('chapter-1');
  });

  test('derives introduces/advances/resolves edges to clue ids', () => {
    const result = deriveChapterOutlineGraph(snapshotWith(OUTLINE));

    const edgeIds = result.edges
      .filter((edge) => edge.sourceId === 'chapter-1')
      .map((edge) => edge.id);
    expect(edgeIds).toEqual([
      'edge:introduces:chapter-1:clue-a',
      'edge:advances:chapter-1:clue-b',
      'edge:resolves:chapter-1:clue-c',
    ]);
  });

  test('derives Scene nodes with located-in and knows edges', () => {
    const result = deriveChapterOutlineGraph(snapshotWith(OUTLINE));

    expect(result.nodes).toEqual(
      expect.arrayContaining([
        {
          id: 'scene-1',
          kind: 'Scene',
          label: 'Breach',
          sourceRef: 'state/chapters/chapter-1.md',
          canonicalKind: 'chapter-outline',
        },
      ]),
    );
    expect(result.edges).toEqual(
      expect.arrayContaining([
        {
          id: 'edge:located-in:scene-1:loc-1',
          type: 'located-in',
          sourceId: 'scene-1',
          targetId: 'loc-1',
          provenanceRef: 'state/chapters/chapter-1.md',
        },
        {
          id: 'edge:knows:char-a:scene-1',
          type: 'knows',
          sourceId: 'char-a',
          targetId: 'scene-1',
          provenanceRef: 'state/chapters/chapter-1.md',
        },
      ]),
    );
  });
});

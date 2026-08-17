import { describe, expect, test } from 'bun:test';

import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import { derivePlotClueGraph } from './plot-clue';

function snapshotWith(clueData: Record<string, unknown>): WorkspaceSnapshot {
  return {
    snapshotId: 'snap-test',
    entities: new Map([
      [
        'state/plot-clues/clue.md',
        { path: 'state/plot-clues/clue.md', kind: 'plot-clue', data: clueData, contentHash: 'h' },
      ],
    ]),
  };
}

describe('derivePlotClueGraph', () => {
  test('derives a PlotClue node with the clue title as label', () => {
    const result = derivePlotClueGraph(
      snapshotWith({
        id: 'clue-1',
        title: 'The Lantern',
        knownByCharacterIds: [],
        misledCharacterIds: [],
        dependencyClueIds: [],
        conflictClueIds: [],
      }),
    );

    expect(result.nodes).toEqual([
      {
        id: 'clue-1',
        kind: 'PlotClue',
        label: 'The Lantern',
        sourceRef: 'state/plot-clues/clue.md',
        canonicalKind: 'plot-clue',
      },
    ]);
  });

  test('derives knows, misunderstands, depends-on, and conflicts-with edges', () => {
    const result = derivePlotClueGraph(
      snapshotWith({
        id: 'clue-1',
        title: 'The Lantern',
        knownByCharacterIds: ['char-a'],
        misledCharacterIds: ['char-b'],
        dependencyClueIds: ['clue-0'],
        conflictClueIds: ['clue-2'],
      }),
    );

    const edgeIds = result.edges.map((edge) => edge.id);
    expect(edgeIds).toEqual([
      'edge:knows:char-a:clue-1',
      'edge:misunderstands:char-b:clue-1',
      'edge:depends-on:clue-1:clue-0',
      'edge:conflicts-with:clue-1:clue-2',
    ]);
  });

  test('returns no edges when all relation lists are empty', () => {
    const result = derivePlotClueGraph(
      snapshotWith({
        id: 'clue-1',
        title: 'The Lantern',
        knownByCharacterIds: [],
        misledCharacterIds: [],
        dependencyClueIds: [],
        conflictClueIds: [],
      }),
    );
    expect(result.edges).toEqual([]);
  });
});

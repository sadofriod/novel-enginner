import { describe, expect, test } from 'bun:test';

import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import { deriveCharacterGraph } from './character';

function snapshotWith(characterData: Record<string, unknown>): WorkspaceSnapshot {
  return {
    snapshotId: 'snap-test',
    entities: new Map([
      [
        'state/characters/char.md',
        { path: 'state/characters/char.md', kind: 'character', data: characterData, contentHash: 'h' },
      ],
    ]),
  };
}

describe('deriveCharacterGraph', () => {
  test('derives a Character node with the character name as label', () => {
    const result = deriveCharacterGraph(snapshotWith({ id: 'char-1', name: 'Hero' }));

    expect(result.nodes).toEqual([
      {
        id: 'char-1',
        kind: 'Character',
        label: 'Hero',
        sourceRef: 'state/characters/char.md',
        canonicalKind: 'character',
      },
    ]);
  });

  test('derives knows/misunderstands edges from the knowledge ledger', () => {
    const result = deriveCharacterGraph(
      snapshotWith({
        id: 'char-1',
        name: 'Hero',
        knowledgeLedger: [
          {
            factId: 'fact-a',
            beliefState: 'known',
            sourceRef: 'scene-1',
            chapterAcquired: 1,
            visibility: 'v',
            confidence: 0.9,
          },
          {
            factId: 'fact-b',
            beliefState: 'misunderstood',
            sourceRef: 'scene-2',
            chapterAcquired: 2,
            visibility: 'v',
            confidence: 0.3,
          },
        ],
      }),
    );

    expect(result.edges).toEqual([
      {
        id: 'edge:knows:char-1:fact-a',
        type: 'knows',
        sourceId: 'char-1',
        targetId: 'fact-a',
        provenanceRef: 'scene-1',
      },
      {
        id: 'edge:misunderstands:char-1:fact-b',
        type: 'misunderstands',
        sourceId: 'char-1',
        targetId: 'fact-b',
        provenanceRef: 'scene-2',
      },
    ]);
  });

  test('returns no edges when the ledger is absent', () => {
    const result = deriveCharacterGraph(snapshotWith({ id: 'char-1', name: 'Hero' }));
    expect(result.edges).toEqual([]);
  });
});

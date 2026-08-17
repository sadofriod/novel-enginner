import { describe, expect, test } from 'bun:test';

import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import { deriveFactionGraph } from './faction';

function snapshotWith(factionData: Record<string, unknown>): WorkspaceSnapshot {
  return {
    snapshotId: 'snap-test',
    entities: new Map([
      [
        'state/factions/faction.md',
        { path: 'state/factions/faction.md', kind: 'faction', data: factionData, contentHash: 'h' },
      ],
    ]),
  };
}

describe('deriveFactionGraph', () => {
  test('derives a Faction node with the faction name as label', () => {
    const result = deriveFactionGraph(
      snapshotWith({ id: 'faction-1', name: 'Syndicate', knownByCharacters: [] }),
    );

    expect(result.nodes).toEqual([
      {
        id: 'faction-1',
        kind: 'Faction',
        label: 'Syndicate',
        sourceRef: 'state/factions/faction.md',
        canonicalKind: 'faction',
      },
    ]);
  });

  test('derives knows edges from knownByCharacters', () => {
    const result = deriveFactionGraph(
      snapshotWith({ id: 'faction-1', name: 'Syndicate', knownByCharacters: ['char-a', 'char-b'] }),
    );

    expect(result.edges).toEqual([
      {
        id: 'edge:knows:char-a:faction-1',
        type: 'knows',
        sourceId: 'char-a',
        targetId: 'faction-1',
        provenanceRef: 'state/factions/faction.md',
      },
      {
        id: 'edge:knows:char-b:faction-1',
        type: 'knows',
        sourceId: 'char-b',
        targetId: 'faction-1',
        provenanceRef: 'state/factions/faction.md',
      },
    ]);
  });
});

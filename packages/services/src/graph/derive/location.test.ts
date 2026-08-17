import { describe, expect, test } from 'bun:test';

import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import { deriveLocationGraph } from './location';

function snapshotWith(locationData: Record<string, unknown>): WorkspaceSnapshot {
  return {
    snapshotId: 'snap-test',
    entities: new Map([
      [
        'state/locations/location.md',
        { path: 'state/locations/location.md', kind: 'location', data: locationData, contentHash: 'h' },
      ],
    ]),
  };
}

describe('deriveLocationGraph', () => {
  test('derives a Location node with the location name as label', () => {
    const result = deriveLocationGraph(snapshotWith({ id: 'loc-1', name: 'Station' }));

    expect(result.nodes).toEqual([
      {
        id: 'loc-1',
        kind: 'Location',
        label: 'Station',
        sourceRef: 'state/locations/location.md',
        canonicalKind: 'location',
      },
    ]);
  });

  test('derives located-in edge when a parent location is set', () => {
    const result = deriveLocationGraph(snapshotWith({ id: 'loc-2', name: 'Inner', parentLocation: 'loc-1' }));

    expect(result.edges).toEqual(
      expect.arrayContaining([
        {
          id: 'edge:located-in:loc-2:loc-1',
          type: 'located-in',
          sourceId: 'loc-2',
          targetId: 'loc-1',
          provenanceRef: 'state/locations/location.md',
        },
      ]),
    );
  });

  test('derives controls edge when a control faction is set', () => {
    const result = deriveLocationGraph(snapshotWith({ id: 'loc-1', name: 'Station', controlFaction: 'faction-1' }));

    expect(result.edges).toEqual(
      expect.arrayContaining([
        {
          id: 'edge:controls:faction-1:loc-1',
          type: 'controls',
          sourceId: 'faction-1',
          targetId: 'loc-1',
          provenanceRef: 'state/locations/location.md',
        },
      ]),
    );
  });

  test('derives no edges when neither parent nor control faction is set', () => {
    const result = deriveLocationGraph(snapshotWith({ id: 'loc-1', name: 'Station' }));
    expect(result.edges).toEqual([]);
  });
});

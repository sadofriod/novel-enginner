import { describe, expect, test } from 'bun:test';

import { createApiServer } from './api-server';
import { reSyncState } from '../workspace/sync-engine';

const WORKSPACE_ID = process.env['NOVEL_WORKSPACE_ID'] ?? 'workspace-local';

const FILES = [
  {
    path: 'state/characters/char-mira.md',
    content: `---
id: char-mira
name: Mira Vale
status: active
coreMotivation: Prove that her missing brother left a recoverable trail.
worldview: Every mystery has a material cause.
baselinePersonality: Patient in public, relentless in private.
hardConstraints:
  - Never abandon an injured witness.
goalState: Find the stopped harbor clock.
injuryState: none
techLevel: coastal-industrial
---

# Character

Mira keeps a brass key on a cord beneath her coat.
`,
  },
  {
    path: 'state/factions/faction-harbor-wardens.md',
    content: `---
id: faction-harbor-wardens
name: Harbor Wardens
type: civic-order
goal: Keep the harbor operational and its old records sealed.
resourceIds: []
relationshipIds: []
knownByCharacters:
  - char-mira
status: active
---

# Faction

The wardens control access to the old lighthouse archive.
`,
  },
];

describe('graph endpoint', () => {
  test('GET /graph returns the derived graph when a snapshot exists', async () => {
    const { fetch, store } = createApiServer();
    const result = reSyncState(FILES);
    store.setLastKnownSnapshot(WORKSPACE_ID, result.snapshot);

    const response = await fetch(new Request('http://local.test/graph'));

    expect(response.status).toBe(200);
    const graph = await response.json() as {
      readonly status: string;
      readonly builtFromSnapshotId?: string;
      readonly nodes: readonly unknown[];
    };
    expect(graph.status).toBe('ready');
    expect(graph.builtFromSnapshotId).toBe(result.snapshot.snapshotId);
    expect(graph.nodes.length).toBeGreaterThan(0);
  });

  test('GET /graph returns not-ready when no snapshot is known', async () => {
    const { fetch } = createApiServer();

    const response = await fetch(new Request('http://local.test/graph'));

    expect(response.status).toBe(200);
    const graph = await response.json() as { readonly status: string; readonly nodes: readonly unknown[] };
    expect(graph.status).toBe('not-ready');
    expect(graph.nodes).toEqual([]);
  });
});

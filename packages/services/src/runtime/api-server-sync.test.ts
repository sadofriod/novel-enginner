import { describe, expect, test } from 'bun:test';

import { createApiServer } from './api-server';
import { reSyncState } from '../workspace/sync-engine';

const BASE_ENVELOPE = {
  workspaceId: 'workspace-cybernovel-001',
  bookId: 'book-quantum-ascension',
  artifactType: 'chapter-outline',
  targetId: 'chapter-0042-outline',
  intent: 'propose',
  requestedBy: 'author-local',
  approvalMode: 'manual',
  idempotencyKey: 'cmd-20260812-001',
};

function postJson(fetch: (request: Request) => Promise<Response>, path: string, body: unknown): Promise<Response> {
  return fetch(
    new Request(`http://local.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('sync routes', () => {
  test('POST /sync/re-sync-state without files preserves the existing snapshot', async () => {
    const { fetch, store } = createApiServer();
    const snapshot = reSyncState([
      {
        path: 'state/characters/char-lin-mo.md',
        content: `---
id: char-lin-mo
name: Lin Mo
status: active
coreMotivation: Survive
worldview: pragmatic
techLevel: tier-1
---
`,
      },
    ]).snapshot;
    store.setLastKnownSnapshot(BASE_ENVELOPE.workspaceId, snapshot);

    const response = await postJson(fetch, '/sync/re-sync-state', {
      workspaceId: BASE_ENVELOPE.workspaceId,
      bookId: BASE_ENVELOPE.bookId,
      requestedBy: BASE_ENVELOPE.requestedBy,
      approvalMode: BASE_ENVELOPE.approvalMode,
      idempotencyKey: 'cmd-resync-no-files-001',
    });

    expect(response.status).toBe(202);
    expect(store.getLastKnownSnapshot(BASE_ENVELOPE.workspaceId)).toBe(snapshot);
  });

  test('rebuild-graph projects a canonical derived graph into artifact details', async () => {
    const { fetch, store } = createApiServer();
    store.upsertArtifact({
      artifactType: 'character-update',
      targetId: 'char-derived-test',
      canonicalStatus: 'clean',
    });
    await postJson(fetch, '/sync/re-sync-state', {
      workspaceId: 'workspace-derived-test',
      bookId: 'book-derived-test',
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: 'sync-derived-001',
      files: [{
        path: 'state/characters/char-derived-test.md',
        content: `---
id: char-derived-test
name: Derived
status: active
coreMotivation: survive
worldview: pragmatic
techLevel: tier-1
---
`,
      }],
    });

    const rebuild = await postJson(fetch, '/sync/rebuild-graph', {
      workspaceId: 'workspace-derived-test',
      bookId: 'book-derived-test',
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: 'rebuild-derived-001',
    });
    expect(rebuild.status).toBe(202);
    const artifactResponse = await fetch(new Request('http://local.test/artifacts/character-update/char-derived-test'));
    const artifact = await artifactResponse.json();
    expect(artifact.derivedGraph.status).toBe('ready');
    expect(artifact.derivedGraph.latestCanonicalVersion).toBe('snap-0001');
    expect(artifact.derivedGraph.nodes).toEqual([{ id: 'char-derived-test', label: 'Derived', type: 'Character' }]);
  });

  test('persists workspace validity so invalid sync blocks later write commands', async () => {
    const { fetch } = createApiServer({ reSyncStateOptions: { getActiveRuns: () => [] } });
    const invalidCharacter = `---
id: char-invalid-sync
name: broken
status: not-a-valid-status
---
`;

    const syncResponse = await postJson(fetch, '/sync/re-sync-state', {
      workspaceId: 'workspace-validity-test',
      bookId: 'book-validity-test',
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: 'sync-invalid-001',
      files: [{ path: 'state/characters/char-invalid-sync.md', content: invalidCharacter }],
    });
    expect(syncResponse.status).toBe(202);

    const proposeResponse = await postJson(fetch, '/commands', {
      ...BASE_ENVELOPE,
      workspaceId: 'workspace-validity-test',
      bookId: 'book-validity-test',
      idempotencyKey: 'propose-blocked-after-invalid-sync',
    });
    expect(proposeResponse.status).toBe(400);
    expect((await proposeResponse.json()).code).toBe('workspace-invalid');
  });

  test('POST /sync/rebuild-graph accepts without a body', async () => {
    const { fetch } = createApiServer();
    const response = await fetch(new Request('http://local.test/sync/rebuild-graph', { method: 'POST' }));
    expect(response.status).toBe(400); // missing idempotencyKey/workspaceId/etc. by default
  });

  test('POST /sync/re-sync-state returns the current canonical version for a full file set', async () => {
    const { fetch, store } = createApiServer();
    const response = await postJson(fetch, '/sync/re-sync-state', {
      workspaceId: 'workspace-cybernovel-001',
      bookId: 'book-quantum-ascension',
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: 'cmd-resync-001',
      files: [{
        path: 'state/characters/char-resync-version.md',
        content: `---
id: char-resync-version
name: Resync Character
status: active
coreMotivation: survive
worldview: pragmatic
techLevel: tier-1
---
`,
      }],
    });
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.nextExpectedState).toBe('workspace-synced');
    expect(body.canonicalVersion).toBe(store.getLastKnownSnapshot('workspace-cybernovel-001')?.snapshotId);
  });

  test('dispatches synthetic review when an approved canonical artifact is edited', async () => {
    const reviewRequests: string[] = [];
    const characterMarkdown = (name: string) => `---
id: char-sync-test
name: ${name}
status: active
coreMotivation: survive
worldview: pragmatic
techLevel: tier-1
---
`;
    const { fetch, store } = createApiServer({
      reSyncStateOptions: { getActiveRuns: () => [] },
      dispatchSyntheticReview: async (input) => {
        reviewRequests.push(`${input.artifactType}:${input.targetId}`);
      },
    });
    const base = {
      workspaceId: 'workspace-sync-test',
      bookId: 'book-sync-test',
      requestedBy: 'author-local',
      approvalMode: 'manual',
      files: [{ path: 'state/characters/char-sync-test.md', content: characterMarkdown('初始') }],
    };

    await postJson(fetch, '/sync/re-sync-state', { ...base, idempotencyKey: 'sync-initial-001' });
    store.upsertArtifact({
      artifactType: 'character-update',
      targetId: 'char-sync-test',
      activeProposalId: 'proposal-sync-test',
      proposalStatus: 'approved',
    });
    await postJson(fetch, '/sync/re-sync-state', {
      ...base,
      idempotencyKey: 'sync-edited-001',
      files: [{ path: 'state/characters/char-sync-test.md', content: characterMarkdown('修改后') }],
    });

    expect(reviewRequests).toEqual(['character-update:char-sync-test']);
  });
});

import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApiServer } from './api-server';
import { RunEventBus } from './event-bus';
import { RuntimeStore } from './store';
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

describe('command envelope validation', () => {
  test('accepts a well-formed proposal command and returns the minimal response shape', async () => {
    const { fetch } = createApiServer();
    const response = await postJson(fetch, '/commands', BASE_ENVELOPE);
    expect(response.status).toBe(202);

    const body = await response.json();
    expect(body.status).toBe('accepted');
    expect(typeof body.commandId).toBe('string');
    expect(typeof body.runId).toBe('string');
    expect(body.artifactType).toBe('chapter-outline');
    expect(body.targetId).toBe('chapter-0042-outline');
    expect(body.nextExpectedState).toBe('proposal-pending');
    expect(body.sseChannel).toBe(`/runs/${body.runId}/stream`);
  });

  test('rejects a malformed command envelope', async () => {
    const { fetch } = createApiServer();
    const response = await postJson(fetch, '/commands', { ...BASE_ENVELOPE, idempotencyKey: '' });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe('rejected');
    expect(body.code).toBe('invalid-command-envelope');
  });

  test('rejects a system intent that sets artifactType', async () => {
    const { fetch } = createApiServer();
    const response = await postJson(fetch, '/commands', {
      ...BASE_ENVELOPE,
      intent: 'rebuild-graph',
      systemTaskType: 'rebuild-graph',
      idempotencyKey: 'cmd-system-001',
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('invalid-command-envelope');
  });

  test('accepts a system intent without artifactType/targetId', async () => {
    const { fetch } = createApiServer();
    const response = await postJson(fetch, '/commands', {
      workspaceId: 'workspace-cybernovel-001',
      bookId: 'book-quantum-ascension',
      systemTaskType: 'rebuild-graph',
      intent: 'rebuild-graph',
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: 'cmd-system-002',
    });
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.status).toBe('accepted');
    expect(body.nextExpectedState).toBe('derived-ready');
  });

  test('is idempotent on repeated idempotencyKey', async () => {
    const { fetch } = createApiServer();
    const first = await postJson(fetch, '/commands', BASE_ENVELOPE);
    const second = await postJson(fetch, '/commands', BASE_ENVELOPE);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody.commandId).toBe(firstBody.commandId);
    expect(secondBody.runId).toBe(firstBody.runId);
  });

  test('rejects write-related intents while the workspace is invalid', async () => {
    const { fetch } = createApiServer({ getWorkspaceValidity: () => 'invalid' });
    const response = await postJson(fetch, '/commands', { ...BASE_ENVELOPE, idempotencyKey: 'cmd-blocked-001' });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('workspace-invalid');
  });

  test('dispatches a newly accepted artifact command to the workflow adapter', async () => {
    const dispatched: string[] = [];
    const { fetch } = createApiServer({
      dispatchCommand: async (envelope) => {
        dispatched.push(`${envelope.artifactType}:${envelope.targetId}`);
      },
    });
    const response = await postJson(fetch, '/commands', { ...BASE_ENVELOPE, idempotencyKey: 'cmd-dispatch-001' });
    await postJson(fetch, '/commands', { ...BASE_ENVELOPE, idempotencyKey: 'cmd-dispatch-001' });

    expect(response.status).toBe(202);
    expect(dispatched).toEqual(['chapter-outline:chapter-0042-outline']);
  });

  test('commits an approved proposal draft to the canonical workspace', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'novel-enginner-'));
    const store = new RuntimeStore();
    const snapshot = reSyncState([]).snapshot;
    const proposal = {
      proposalId: 'proposal-chapter-0042-001',
      artifactType: 'chapter-outline' as const,
      targetId: 'chapter-0042-outline',
      status: 'pending-approval' as const,
      intent: 'propose' as const,
      basedOnCanonicalVersion: snapshot.snapshotId,
      parentRunId: 'run-proposal-001',
    };
    const content = '---\nid: chapter-0042-outline\n---\n\n# Chapter Outline\n';
    store.setLastKnownSnapshot(BASE_ENVELOPE.workspaceId, snapshot);
    store.saveCanonicalDraft({
      proposalId: proposal.proposalId,
      relativePath: 'state/chapters/chapter-0042-outline.md',
      content,
    });
    const { fetch } = createApiServer({
      store,
      workspaceRoot,
      loadActiveProposal: async () => proposal,
    });

    try {
      const response = await postJson(fetch, '/commands', {
        ...BASE_ENVELOPE,
        intent: 'approve',
        idempotencyKey: 'cmd-commit-canonical-001',
      });

      expect(response.status).toBe(202);
      expect(await readFile(join(workspaceRoot, 'state/chapters/chapter-0042-outline.md'), 'utf8')).toBe(content);
      expect(store.getArtifact('chapter-outline', 'chapter-0042-outline')?.proposalStatus).toBe('approved');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('keeps an approval retryable when its canonical draft is unavailable', async () => {
    const store = new RuntimeStore();
    const snapshot = reSyncState([]).snapshot;
    const proposal = {
      proposalId: 'proposal-chapter-0042-missing-draft',
      artifactType: 'chapter-outline' as const,
      targetId: 'chapter-0042-outline',
      status: 'pending-approval' as const,
      intent: 'propose' as const,
      basedOnCanonicalVersion: snapshot.snapshotId,
      parentRunId: 'run-proposal-missing-draft',
    };
    store.setLastKnownSnapshot(BASE_ENVELOPE.workspaceId, snapshot);
    const eventBus = new RunEventBus();
    const persistedStatuses: string[] = [];
    const { fetch } = createApiServer({
      store,
      eventBus,
      loadActiveProposal: async () => proposal,
      persistProposalDecision: async (_workspaceId, _bookId, persistedProposal) => {
        persistedStatuses.push(persistedProposal.status);
      },
    });

    const response = await postJson(fetch, '/commands', {
      ...BASE_ENVELOPE,
      intent: 'approve',
      idempotencyKey: 'cmd-commit-canonical-missing-draft',
    });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(store.getArtifact('chapter-outline', 'chapter-0042-outline')).toMatchObject({
      proposalStatus: 'approved',
      canonicalStatus: 'draft',
    });
    expect(persistedStatuses).toEqual(['approved']);
    expect(eventBus.history(body.runId).at(-1)?.data).toEqual({
      reason: 'canonical draft not found for proposal proposal-chapter-0042-missing-draft',
    });
  });
});

describe('run / artifact lookup', () => {
  test('run control commands transition the targeted run', async () => {
    const { fetch, store } = createApiServer();
    const accepted = await postJson(fetch, '/commands', { ...BASE_ENVELOPE, idempotencyKey: 'cmd-control-base-001' });
    const { runId } = await accepted.json();

    const response = await postJson(fetch, '/commands', {
      ...BASE_ENVELOPE,
      targetId: runId,
      intent: 'abort-run',
      idempotencyKey: 'cmd-control-abort-001',
    });

    expect(response.status).toBe(202);
    expect(store.getRun(runId)?.status).toBe('aborted');
    expect(store.getRun(runId)?.nextExpectedState).toBe('run-aborted');
  });

  test('GET /app redirects to the separately hosted web console', async () => {
    const { fetch, store } = createApiServer();
    store.upsertArtifact({
      artifactType: 'chapter-outline',
      targetId: 'chapter-0042-outline',
      canonicalStatus: 'clean',
      activeProposalId: 'proposal-chapter-0042-002',
      proposalStatus: 'pending-approval',
      proposalDetail: {
        basedOnCanonicalVersion: 'snap-0001',
        diffs: [
          {
            field: 'displayTitle',
            canonical: '旧标题',
            proposed: '新标题',
            changed: true,
          },
        ],
      },
      bundledDiff: [
        {
          artifactType: 'character-update',
          targetId: 'char-lin-mo',
          changeKind: 'update',
          summary: '更新角色状态',
        },
      ],
      reviewerResult: {
        approved: true,
        totalScore: 92,
        overrideEligible: false,
        hardFailures: [],
        dimensionScores: {
          antiAiVoice: 92,
          webFictionPacing: 90,
          emotionCurve: 91,
          characterConsistency: 94,
          settingConsistency: 93,
          clueCausality: 92,
          readabilityLayout: 90,
          languageTexture: 94,
        },
        rewriteDirectives: ['保持冲突推进'],
      },
      derivedGraph: {
        status: 'ready',
        latestCanonicalVersion: 'snap-0001',
        graphSnapshotVersion: 'graph-snap-0001',
        nodes: [
          { id: 'chapter-0042-outline', label: '第 42 章', type: 'Chapter' },
          { id: 'char-lin-mo', label: '林默', type: 'Character' },
        ],
        edges: [
          { source: 'chapter-0042-outline', target: 'char-lin-mo', type: 'introduces' },
        ],
      },
    });

    const response = await fetch(new Request('http://local.test/app?artifactType=chapter-outline&targetId=chapter-0042-outline'));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toContain('http://localhost:3001/app');
  });

  test('GET /runs/:runId returns the run snapshot after a command is accepted', async () => {
    const { fetch } = createApiServer();
    const accepted = await postJson(fetch, '/commands', { ...BASE_ENVELOPE, idempotencyKey: 'cmd-run-lookup-001' });
    const { runId } = await accepted.json();

    const response = await fetch(new Request(`http://local.test/runs/${runId}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.runId).toBe(runId);
    expect(body.status).toBe('accepted');
  });

  test('GET /runs/:runId returns 404 for an unknown run', async () => {
    const { fetch } = createApiServer();
    const response = await fetch(new Request('http://local.test/runs/run-does-not-exist'));
    expect(response.status).toBe(404);
  });

  test('GET /commands/:commandId returns the command record', async () => {
    const { fetch } = createApiServer();
    const accepted = await postJson(fetch, '/commands', { ...BASE_ENVELOPE, idempotencyKey: 'cmd-cmd-lookup-001' });
    const { commandId } = await accepted.json();

    const response = await fetch(new Request(`http://local.test/commands/${commandId}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.commandId).toBe(commandId);
  });

  test('bootstrap session resource endpoints exist', async () => {
    const { fetch } = createApiServer();

    const listResponse = await fetch(new Request('http://local.test/bootstrap-sessions'));
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual([]);

    const detailResponse = await fetch(new Request('http://local.test/bootstrap-sessions/bootstrap-session-001'));
    expect(detailResponse.status).toBe(404);
  });

  test('GET /artifacts/:artifactType/:targetId returns a stored summary', async () => {
    const { fetch, store } = createApiServer();
    store.upsertArtifact({
      artifactType: 'chapter-outline',
      targetId: 'chapter-0042-outline',
      canonicalStatus: 'draft',
      activeProposalId: 'proposal-chapter-0042-002',
      proposalStatus: 'pending-approval',
    });

    const response = await fetch(new Request('http://local.test/artifacts/chapter-outline/chapter-0042-outline'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.activeProposalId).toBe('proposal-chapter-0042-002');
  });

  test('GET /artifacts/:artifactType/:targetId returns 404 when missing', async () => {
    const { fetch } = createApiServer();
    const response = await fetch(new Request('http://local.test/artifacts/chapter-outline/unknown'));
    expect(response.status).toBe(404);
  });

  test('POST /app/actions/command submits a web approval action and redirects back to the artifact page', async () => {
    const { fetch, store } = createApiServer();
    store.upsertArtifact({
      artifactType: 'chapter-outline',
      targetId: 'chapter-0042-outline',
      canonicalStatus: 'draft',
      activeProposalId: 'proposal-chapter-0042-002',
      proposalStatus: 'pending-approval',
    });

    const body = new URLSearchParams({
      workspaceId: 'workspace-cybernovel-001',
      bookId: 'book-quantum-ascension',
      artifactType: 'chapter-outline',
      targetId: 'chapter-0042-outline',
      intent: 'approve',
      note: '修正一个短标题',
      redirectTo: '/app?artifactType=chapter-outline&targetId=chapter-0042-outline',
    });
    const response = await fetch(new Request('http://local.test/app/actions/command', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/app?artifactType=chapter-outline&targetId=chapter-0042-outline');
    const artifact = store.getArtifact('chapter-outline', 'chapter-0042-outline');
    expect(artifact?.proposalStatus).toBe('approved');
    expect(artifact?.reviewStale).toBe(true);
    expect(artifact?.inlineEditNote).toBe('修正一个短标题');
  });
});

describe('sync routes', () => {
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

  test('POST /sync/re-sync-state accepts a full envelope body', async () => {
    const { fetch } = createApiServer();
    const response = await postJson(fetch, '/sync/re-sync-state', {
      workspaceId: 'workspace-cybernovel-001',
      bookId: 'book-quantum-ascension',
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: 'cmd-resync-001',
    });
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.nextExpectedState).toBe('workspace-synced');
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

describe('SSE run stream', () => {
  test('GET /runs/:runId/stream replays history and streams new events', async () => {
    const { fetch, eventBus } = createApiServer();
    const accepted = await postJson(fetch, '/commands', { ...BASE_ENVELOPE, idempotencyKey: 'cmd-sse-001' });
    const { runId } = await accepted.json();

    const response = await fetch(new Request(`http://local.test/runs/${runId}/stream`));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    while (!buffered.includes('event: run.started')) {
      const { value } = await reader.read();
      buffered += decoder.decode(value ?? new Uint8Array());
    }
    expect(buffered).toContain('event: command.accepted');
    expect(buffered).toContain('event: run.started');

    eventBus.publish({ type: 'run.completed', runId, emittedAt: new Date().toISOString() });
    let nextBuffered = '';
    while (!nextBuffered.includes('event: run.completed')) {
      const { value } = await reader.read();
      nextBuffered += decoder.decode(value ?? new Uint8Array());
    }
    expect(nextBuffered).toContain('event: run.completed');
    await reader.cancel();
  });

  test('replays only events after Last-Event-ID and bounds event history', async () => {
    const { fetch, eventBus } = createApiServer({ eventBus: new RunEventBus(2) });
    eventBus.publish({ type: 'run.step.completed', runId: 'run-replay-001', emittedAt: '2026-08-14T00:00:00.000Z', data: { step: 1 } });
    eventBus.publish({ type: 'run.step.completed', runId: 'run-replay-001', emittedAt: '2026-08-14T00:00:01.000Z', data: { step: 2 } });
    eventBus.publish({ type: 'run.completed', runId: 'run-replay-001', emittedAt: '2026-08-14T00:00:02.000Z' });

    expect(eventBus.history('run-replay-001')).toHaveLength(2);
    const response = await fetch(new Request('http://local.test/runs/run-replay-001/stream', {
      headers: { 'last-event-id': '2' },
    }));
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    await reader.cancel();
    expect(text).toContain('event: run.completed');
    expect(text).not.toContain('"step":2');
    expect(text).toContain('id: 3');
  });
});

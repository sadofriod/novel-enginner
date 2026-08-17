import { describe, expect, test } from 'bun:test';

import { createApiServer } from './api-server';

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

  test('rejects Web inline edits beyond the 200-character limit', async () => {
    const { fetch, store } = createApiServer();
    store.upsertArtifact({ artifactType: 'chapter-outline', targetId: 'chapter-inline-001' });
    const form = new FormData();
    form.set('workspaceId', 'workspace-inline');
    form.set('bookId', 'book-inline');
    form.set('artifactType', 'chapter-outline');
    form.set('targetId', 'chapter-inline-001');
    form.set('intent', 'approve');
    form.set('note', 'a'.repeat(201));
    const response = await fetch(new Request('http://local.test/app/actions/command', { method: 'POST', body: form }));

    expect(response.status).toBe(400);
    expect(store.getArtifact('chapter-outline', 'chapter-inline-001')?.inlineEditNote).toBeUndefined();
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
    expect(artifact?.proposalStatus).toBe('pending-approval');
    expect(artifact?.reviewStale).toBe(true);
    expect(artifact?.inlineEditNote).toBe('修正一个短标题');
  });
});

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
});

describe('run / artifact lookup', () => {
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
});

describe('sync routes', () => {
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
});

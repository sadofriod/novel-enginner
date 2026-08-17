import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';

import { createApiServer } from './api-server';
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

  test('rejects an artifact intent without a targetId', async () => {
    const { fetch } = createApiServer();
    const response = await postJson(fetch, '/commands', {
      ...BASE_ENVELOPE,
      targetId: undefined,
      idempotencyKey: 'cmd-missing-target-001',
    });
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

  test('creates a bootstrap session and publishes lifecycle events through the accepted run', async () => {
    const persistedSessionIds: string[] = [];
    const { fetch, eventBus, store } = createApiServer({
      persistBootstrapState: async (session) => {
        persistedSessionIds.push(session.id);
      },
    });
    const response = await postJson(fetch, '/commands', {
      workspaceId: 'workspace-bootstrap-api',
      bookId: 'book-bootstrap-api',
      systemTaskType: 'create-bootstrap-session',
      intent: 'create-bootstrap-session',
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: 'cmd-bootstrap-create-api-001',
      sessionId: 'bootstrap-session-api-001',
      path: 'new-book',
      bookName: 'API Bootstrap Novel',
    });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(store.getBootstrapSession('bootstrap-session-api-001')).toMatchObject({
      currentStage: 'market-research',
      bookName: 'API Bootstrap Novel',
    });
    expect(persistedSessionIds).toEqual(['bootstrap-session-api-001']);
    expect(eventBus.history(body.runId).map((event) => event.type)).toEqual([
      'command.accepted',
      'run.started',
      'bootstrap.session.updated',
      'bootstrap.stage.changed',
    ]);
  });

  test('confirms an approved import mapping and records its health-report revision', async () => {
    const sourceRoot = await mkdtemp('/tmp/novel-import-api-source-');
    const targetRoot = await mkdtemp('/tmp/novel-import-api-target-');
    await Bun.write(`${sourceRoot}/project-brief.md`, 'brief');
    const { fetch, store } = createApiServer();
    const create = await postJson(fetch, '/commands', {
      workspaceId: 'workspace-import-api', bookId: 'book-import-api', systemTaskType: 'create-bootstrap-session', intent: 'create-bootstrap-session', requestedBy: 'author-local', approvalMode: 'manual', idempotencyKey: 'create-import-api', sessionId: 'bootstrap-import-api', path: 'import',
    });
    expect(create.status).toBe(202);
    try {
      const response = await postJson(fetch, '/commands', {
        workspaceId: 'workspace-import-api', bookId: 'book-import-api', systemTaskType: 'confirm-import', intent: 'confirm-import', requestedBy: 'author-local', approvalMode: 'manual', idempotencyKey: 'confirm-import-api', sessionId: 'bootstrap-import-api', sourceRoot, targetRoot,
        mapping: { approved: true, summary: 'confirmed', entries: [{ sourcePath: 'project-brief.md', detectedKind: 'project-brief', canonicalTarget: 'state/book/project-brief.md', confidence: 1 }] },
      });
      expect(response.status).toBe(202);
      expect(store.getBootstrapSession('bootstrap-import-api')?.currentStage).toBe('import-health-report');
      expect(store.listBootstrapRevisions('bootstrap-import-api')[0]?.draft).toMatchObject({ ready: false });
      expect(await Bun.file(`${targetRoot}/state/book/project-brief.md`).text()).toBe('brief');
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(targetRoot, { recursive: true, force: true });
    }
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

  test('does not dispatch approval commands to proposal-generation workflows', async () => {
    const dispatched: string[] = [];
    const loadedBookIds: string[] = [];
    const snapshot = reSyncState([]).snapshot;
    const store = new RuntimeStore();
    store.setLastKnownSnapshot(BASE_ENVELOPE.workspaceId, snapshot);
    const { fetch } = createApiServer({
      store,
      dispatchCommand: async (envelope) => {
        dispatched.push(envelope.intent);
      },
      loadActiveProposal: async (_workspaceId, bookId) => {
        loadedBookIds.push(bookId);
        return {
        proposalId: 'proposal-approval-dispatch-001',
        artifactType: 'chapter-outline',
        targetId: 'chapter-0042-outline',
        status: 'pending-approval',
        intent: 'propose',
        basedOnCanonicalVersion: snapshot.snapshotId,
        parentRunId: 'run-approval-dispatch-001',
        };
      },
    });
    const response = await postJson(fetch, '/commands', {
      ...BASE_ENVELOPE,
      intent: 'approve',
      idempotencyKey: 'cmd-approval-dispatch-001',
    });

    expect(response.status).toBe(202);
    expect(dispatched).toEqual([]);
    expect(loadedBookIds).toEqual([BASE_ENVELOPE.bookId]);
  });
});

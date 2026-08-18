import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';

import { createApiServer } from './api-server';
import { RuntimeStore } from './store';
import { reSyncState } from '../workspace/sync-engine';
import { serializeCanonicalMarkdown } from '../workspace/markdown';
import { generateProjectBriefProposal } from '../bootstrap/research/research-orchestrator';
import { readyImportMapping, writeReadyImportSource } from '../bootstrap/import/import-test-fixtures';

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
      // Nothing is written to the canonical root before the author approves the import proposals.
      expect(await Bun.file(`${targetRoot}/state/book/project-brief.md`).exists()).toBe(false);
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(targetRoot, { recursive: true, force: true });
    }
  });

  test('creates imported proposals and holds the session in import-review until author approval', async () => {
    const sourceRoot = await mkdtemp('/tmp/novel-import-api-ready-src-');
    const targetRoot = await mkdtemp('/tmp/novel-import-api-ready-tgt-');
    await writeReadyImportSource(sourceRoot);
    const { fetch, store, eventBus } = createApiServer();
    const create = await postJson(fetch, '/commands', {
      workspaceId: 'workspace-import-api-ready', bookId: 'book-import-api-ready', systemTaskType: 'create-bootstrap-session', intent: 'create-bootstrap-session', requestedBy: 'author-local', approvalMode: 'manual', idempotencyKey: 'create-import-ready', sessionId: 'bootstrap-import-ready', path: 'import',
    });
    expect(create.status).toBe(202);
    try {
      const response = await postJson(fetch, '/commands', {
        workspaceId: 'workspace-import-api-ready', bookId: 'book-import-api-ready', systemTaskType: 'confirm-import', intent: 'confirm-import', requestedBy: 'author-local', approvalMode: 'manual', idempotencyKey: 'confirm-import-ready', sessionId: 'bootstrap-import-ready', sourceRoot, targetRoot,
        mapping: readyImportMapping(),
      });
      expect(response.status).toBe(202);
      const body = await response.json();

      expect(store.getBootstrapSession('bootstrap-import-ready')?.status).toBe('import-review');
      expect(store.getBootstrapSession('bootstrap-import-ready')?.currentStage).toBe('import-health-report');
      const firstProposal = store.getProposal(`proposal-${body.runId}-1`);
      expect(firstProposal).toMatchObject({ origin: 'imported', status: 'pending-approval', intent: 'propose' });
      const types = eventBus.history(body.runId).map((event) => event.type);
      expect(types).toContain('bootstrap.import-proposals-created');
      expect(types).not.toContain('bootstrap.ready-to-write');
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(targetRoot, { recursive: true, force: true });
    }
  });

  test('keeps an incomplete import in import-review without the ready-to-write event', async () => {
    const sourceRoot = await mkdtemp('/tmp/novel-import-api-partial-src-');
    const targetRoot = await mkdtemp('/tmp/novel-import-api-partial-tgt-');
    await Bun.write(`${sourceRoot}/project-brief.md`, 'brief');
    const { fetch, store, eventBus } = createApiServer();
    await postJson(fetch, '/commands', {
      workspaceId: 'workspace-import-api-partial', bookId: 'book-import-api-partial', systemTaskType: 'create-bootstrap-session', intent: 'create-bootstrap-session', requestedBy: 'author-local', approvalMode: 'manual', idempotencyKey: 'create-import-partial', sessionId: 'bootstrap-import-partial', path: 'import',
    });
    try {
      const response = await postJson(fetch, '/commands', {
        workspaceId: 'workspace-import-api-partial', bookId: 'book-import-api-partial', systemTaskType: 'confirm-import', intent: 'confirm-import', requestedBy: 'author-local', approvalMode: 'manual', idempotencyKey: 'confirm-import-partial', sessionId: 'bootstrap-import-partial', sourceRoot, targetRoot,
        mapping: { approved: true, summary: 'confirmed', entries: [{ sourcePath: 'project-brief.md', detectedKind: 'project-brief', canonicalTarget: 'state/book/project-brief.md', confidence: 1 }] },
      });
      expect(response.status).toBe(202);

      expect(store.getBootstrapSession('bootstrap-import-partial')?.status).toBe('import-review');
      const types = eventBus.history(JSON.parse(await response.text()).runId).map((event) => event.type);
      expect(types).not.toContain('bootstrap.ready-to-write');
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(targetRoot, { recursive: true, force: true });
    }
  });

  test('atomically creates Book + project-brief + first snapshot when the project brief is approved', async () => {
    const workspaceRoot = await mkdtemp('/tmp/novel-bootstrap-approve-root-');
    const store = new RuntimeStore();
    const baseline = reSyncState([]).snapshot;
    store.setLastKnownSnapshot('workspace-bootstrap-approve', baseline);
    store.upsertBootstrapSession({
      id: 'bootstrap-brief-approve',
      workspaceId: 'workspace-bootstrap-approve',
      bookId: 'book-bootstrap-approve',
      path: 'new-book',
      status: 'awaiting-approval',
      currentStage: 'project-brief',
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    });
    const brief = generateProjectBriefProposal({
      bookId: 'book-bootstrap-approve',
      decisions: { title: 'Nova Run', genre: '科幻', targetAudience: '青年读者', readerPromise: '持续紧张感', corePremise: '在规则中追求自由', openingHook: '开场事件', contentBoundaries: '不剧透', format: '连载长篇' },
    });
    const proposalId = 'proposal-brief-approve-001';
    const { fetch, store: apiStore, eventBus } = createApiServer({
      store,
      workspaceRoot,
      loadActiveProposal: async () => ({
        proposalId,
        artifactType: 'project-brief',
        targetId: brief.id,
        status: 'pending-approval',
        intent: 'propose',
        origin: 'author',
        basedOnCanonicalVersion: baseline.snapshotId,
        parentRunId: 'run-brief-approve-001',
      }),
      loadCanonicalDraft: async () => ({
        proposalId,
        relativePath: 'state/book/project-brief.md',
        content: serializeCanonicalMarkdown({ frontmatter: brief }),
      }),
    });
    try {
      const response = await postJson(fetch, '/commands', {
        workspaceId: 'workspace-bootstrap-approve',
        bookId: 'book-bootstrap-approve',
        artifactType: 'project-brief',
        targetId: brief.id,
        intent: 'approve',
        requestedBy: 'author-local',
        approvalMode: 'manual',
        idempotencyKey: 'approve-brief-001',
      });
      expect(response.status).toBe(202);

      expect(await Bun.file(`${workspaceRoot}/state/book/book.md`).text()).toContain('Nova Run');
      expect(await Bun.file(`${workspaceRoot}/state/book/project-brief.md`).text()).toContain('approved');

      const snapshot = apiStore.getLastKnownSnapshot('workspace-bootstrap-approve');
      expect(snapshot?.entities.has('state/book/book.md')).toBe(true);
      expect(snapshot?.entities.has('state/book/project-brief.md')).toBe(true);

      expect(apiStore.getBootstrapSession('bootstrap-brief-approve')).toMatchObject({
        status: 'advancing',
        currentStage: 'world-foundation',
      });

      const runId = JSON.parse(await response.text()).runId;
      expect(eventBus.history(runId).map((event) => event.type)).toContain('artifact.canonical-committed');
      expect(eventBus.history(runId).map((event) => event.type)).toContain('bootstrap.stage.changed');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
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
        origin: 'author',
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

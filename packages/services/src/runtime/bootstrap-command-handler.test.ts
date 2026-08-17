import { describe, expect, test } from 'bun:test';

import { applyBootstrapCommand } from './bootstrap-command-handler';
import { RuntimeStore } from './store';

const BASE_ENVELOPE = {
  workspaceId: 'workspace-bootstrap-test',
  bookId: 'book-bootstrap-test',
  systemTaskType: 'create-bootstrap-session' as const,
  intent: 'create-bootstrap-session' as const,
  requestedBy: 'author-local',
  approvalMode: 'manual' as const,
  idempotencyKey: 'bootstrap-create-001',
};

describe('applyBootstrapCommand', () => {
  test('creates a recoverable new-book session at market research', () => {
    const store = new RuntimeStore();
    const result = applyBootstrapCommand({
      store,
      envelope: BASE_ENVELOPE,
      runId: 'run-bootstrap-create-001',
      payload: { sessionId: 'bootstrap-session-001', path: 'new-book', bookName: 'Test Novel' },
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    });

    expect(result.events.map((event) => event.type)).toEqual(['bootstrap.session.updated', 'bootstrap.stage.changed']);
    expect(store.getBootstrapSession('bootstrap-session-001')).toMatchObject({
      status: 'drafting',
      currentStage: 'market-research',
      bookName: 'Test Novel',
    });
  });

  test('appends an immutable dialogue revision to an existing session', () => {
    const store = new RuntimeStore();
    applyBootstrapCommand({
      store,
      envelope: BASE_ENVELOPE,
      runId: 'run-bootstrap-create-001',
      payload: { sessionId: 'bootstrap-session-001', path: 'new-book' },
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    });
    const result = applyBootstrapCommand({
      store,
      envelope: { ...BASE_ENVELOPE, intent: 'submit-dialogue-round', systemTaskType: 'submit-dialogue-round' },
      runId: 'run-bootstrap-round-001',
      payload: {
        sessionId: 'bootstrap-session-001',
        summary: '作者确认了核心创意。',
        draft: { genre: '科幻' },
      },
      now: () => new Date('2026-08-15T00:01:00.000Z'),
    });

    const session = store.getBootstrapSession('bootstrap-session-001');
    expect(session?.currentRevisionId).toBe('bootstrap-revision-run-bootstrap-round-001');
    expect(store.listBootstrapRevisions('bootstrap-session-001')).toEqual([
      expect.objectContaining({
        id: 'bootstrap-revision-run-bootstrap-round-001',
        summary: '作者确认了核心创意。',
        draft: { genre: '科幻' },
      }),
    ]);
    expect(result.events.map((event) => event.type)).toEqual(['bootstrap.session.updated']);
  });

  test('requires five dialogue revisions before an author can continue to project brief', () => {
    const store = new RuntimeStore();
    applyBootstrapCommand({
      store,
      envelope: BASE_ENVELOPE,
      runId: 'run-bootstrap-create-001',
      payload: { sessionId: 'bootstrap-session-001', path: 'new-book' },
    });
    const research = applyBootstrapCommand({
      store,
      envelope: { ...BASE_ENVELOPE, intent: 'submit-market-research', systemTaskType: 'submit-market-research' },
      runId: 'run-bootstrap-research-001',
      payload: { sessionId: 'bootstrap-session-001', summary: 'Market constraints recorded.' },
    });
    expect(research.events).toHaveLength(1);
    applyBootstrapCommand({
      store,
      envelope: { ...BASE_ENVELOPE, intent: 'continue-bootstrap-session', systemTaskType: 'continue-bootstrap-session' },
      runId: 'run-bootstrap-continue-market-001',
      payload: { sessionId: 'bootstrap-session-001' },
    });

    expect(() => applyBootstrapCommand({
      store,
      envelope: { ...BASE_ENVELOPE, intent: 'continue-bootstrap-session', systemTaskType: 'continue-bootstrap-session' },
      runId: 'run-bootstrap-continue-dialogue-001',
      payload: { sessionId: 'bootstrap-session-001' },
    })).toThrow('Five inspiration dialogue revisions');

    for (const round of [1, 2, 3, 4, 5]) {
      applyBootstrapCommand({
        store,
        envelope: { ...BASE_ENVELOPE, intent: 'submit-dialogue-round', systemTaskType: 'submit-dialogue-round' },
        runId: `run-bootstrap-round-${round}`,
        payload: { sessionId: 'bootstrap-session-001', summary: `Round ${round}` },
      });
    }

    const continued = applyBootstrapCommand({
      store,
      envelope: { ...BASE_ENVELOPE, intent: 'continue-bootstrap-session', systemTaskType: 'continue-bootstrap-session' },
      runId: 'run-bootstrap-continue-dialogue-002',
      payload: { sessionId: 'bootstrap-session-001' },
    });
    expect(store.getBootstrapSession('bootstrap-session-001')).toMatchObject({
      currentStage: 'project-brief',
      status: 'awaiting-approval',
    });
    expect(continued.events.map((event) => event.type)).toEqual(['bootstrap.session.updated', 'bootstrap.stage.changed']);
  });

  test('moves import scans to mapping review and supports explicit abandonment', () => {
    const store = new RuntimeStore();
    applyBootstrapCommand({
      store,
      envelope: BASE_ENVELOPE,
      runId: 'run-bootstrap-import-create-001',
      payload: { sessionId: 'bootstrap-import-001', path: 'import' },
    });
    const scan = applyBootstrapCommand({
      store,
      envelope: { ...BASE_ENVELOPE, intent: 'scan-import-directory', systemTaskType: 'scan-import-directory' },
      runId: 'run-bootstrap-import-scan-001',
      payload: { sessionId: 'bootstrap-import-001', mapping: { entries: [] }, diagnostics: ['Needs author mapping.'] },
    });
    expect(scan.events.map((event) => event.type)).toEqual(['bootstrap.session.updated', 'bootstrap.stage.changed']);
    expect(store.getBootstrapSession('bootstrap-import-001')).toMatchObject({
      currentStage: 'import-mapping',
      status: 'import-review',
    });

    applyBootstrapCommand({
      store,
      envelope: { ...BASE_ENVELOPE, intent: 'discard-bootstrap-session', systemTaskType: 'discard-bootstrap-session' },
      runId: 'run-bootstrap-import-discard-001',
      payload: { sessionId: 'bootstrap-import-001' },
    });
    expect(store.getBootstrapSession('bootstrap-import-001')?.status).toBe('abandoned');
  });

  test('auto-generates a schema-valid project-brief proposal after the five dialogue rounds', () => {
    const store = new RuntimeStore();
    applyBootstrapCommand({
      store,
      envelope: BASE_ENVELOPE,
      runId: 'run-bootstrap-generate-create-001',
      payload: { sessionId: 'bootstrap-generate-001', path: 'new-book', bookName: 'Nova Run' },
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    });
    applyBootstrapCommand({
      store,
      envelope: { ...BASE_ENVELOPE, intent: 'continue-bootstrap-session', systemTaskType: 'continue-bootstrap-session' },
      runId: 'run-bootstrap-generate-to-dialogue-001',
      payload: { sessionId: 'bootstrap-generate-001' },
      now: () => new Date('2026-08-15T00:01:00.000Z'),
    });
    const decisions = { genre: '科幻, 太空歌剧', targetAudience: '青年读者', readerPromise: '持续紧张感', corePremise: '在规则中追求自由', openingHook: '开场事件', contentBoundaries: '不剧透', format: '连载长篇' };
    for (const round of [1, 2, 3, 4, 5]) {
      applyBootstrapCommand({
        store,
        envelope: { ...BASE_ENVELOPE, intent: 'submit-dialogue-round', systemTaskType: 'submit-dialogue-round' },
        runId: `run-bootstrap-generate-round-${round}`,
        payload: { sessionId: 'bootstrap-generate-001', summary: `Round ${round}`, draft: decisions },
        now: () => new Date(`2026-08-15T00:0${round + 1}:00.000Z`),
      });
    }

    const continued = applyBootstrapCommand({
      store,
      envelope: { ...BASE_ENVELOPE, intent: 'continue-bootstrap-session', systemTaskType: 'continue-bootstrap-session' },
      runId: 'run-bootstrap-generate-continue-001',
      payload: { sessionId: 'bootstrap-generate-001' },
      now: () => new Date('2026-08-15T00:07:00.000Z'),
    });

    const session = store.getBootstrapSession('bootstrap-generate-001');
    expect(session).toMatchObject({ currentStage: 'project-brief', status: 'awaiting-approval' });
    expect(continued.events.map((event) => event.type)).toEqual(['bootstrap.session.updated', 'bootstrap.stage.changed']);

    const briefId = 'project-brief-book-bootstrap-test';
    const proposal = store.getActiveProposal('project-brief', briefId);
    expect(proposal).toBeDefined();
    expect(proposal?.status).toBe('pending-approval');
    const draft = store.getCanonicalDraft(proposal?.proposalId ?? '');
    expect(draft?.relativePath).toBe('state/book/project-brief.md');
    expect(store.getLastKnownSnapshot('workspace-bootstrap-test')?.snapshotId).toBe('snap-0001');
  });

  test('persists market-research evidence through the restricted research port', () => {
    const store = new RuntimeStore();
    applyBootstrapCommand({
      store,
      envelope: BASE_ENVELOPE,
      runId: 'run-bootstrap-evidence-create-001',
      payload: { sessionId: 'bootstrap-evidence-001', path: 'new-book' },
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    });
    const port = {
      research: async () => [],
      evaluatePolicy: (source: { readonly url: string }) => ({
        license: 'cc-by' as const,
        copyrightBoundary: source.url.includes('example.com') ? 'blocked' as const : 'allowed' as const,
      }),
    };

    const result = applyBootstrapCommand({
      store,
      envelope: { ...BASE_ENVELOPE, intent: 'submit-market-research', systemTaskType: 'submit-market-research' },
      runId: 'run-bootstrap-evidence-research-001',
      payload: {
        sessionId: 'bootstrap-evidence-001',
        summary: 'Trend brief.',
        sources: [
          { url: 'https://archive.org/details/trend', title: 'Trend Report', summary: 'Readers want  A '.repeat(50) + 'nuance.' },
          { url: 'https://example.com/leak', title: 'Restricted', summary: 'summary' },
        ],
      },
      marketResearchPort: port,
      now: () => new Date('2026-08-15T00:01:00.000Z'),
    });

    expect(result.events.map((event) => event.type)).toEqual(['bootstrap.session.updated']);
    const evidence = store.listBootstrapEvidence('bootstrap-evidence-001');
    expect(evidence).toHaveLength(2);
    const permissive = evidence[0]!;
    const blocked = evidence[1]!;
    expect(permissive).toMatchObject({
      url: 'https://archive.org/details/trend',
      license: 'cc-by',
      copyrightBoundary: 'allowed',
      status: 'draft',
    });
    expect(permissive.cleanedSummary).toBeDefined();
    expect(blocked).toMatchObject({ license: 'cc-by', copyrightBoundary: 'blocked' });
    const revision = store.listBootstrapRevisions('bootstrap-evidence-001')[0];
    expect(revision?.evidenceIds).toEqual([permissive.id, blocked.id]);
  });

  test('blocks continuing to write when the import health report is not ready', () => {
    const store = new RuntimeStore();
    const session = {
      id: 'bootstrap-import-health-001',
      workspaceId: 'workspace-bootstrap-test',
      bookId: 'book-bootstrap-test',
      path: 'import' as const,
      status: 'import-review' as const,
      currentStage: 'import-health-report' as const,
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    };
    store.upsertBootstrapSession(session);
    store.upsertBootstrapRevision({
      id: 'bootstrap-revision-import-health-001',
      sessionId: session.id,
      stage: 'import-health-report',
      createdAt: '2026-08-15T00:01:00.000Z',
      draft: { ready: false, missingArtifacts: ['world-foundation'] },
    });

    expect(() => applyBootstrapCommand({
      store,
      envelope: { ...BASE_ENVELOPE, intent: 'continue-bootstrap-session', systemTaskType: 'continue-bootstrap-session' },
      runId: 'run-bootstrap-import-continue-001',
      payload: { sessionId: session.id },
    })).toThrow('Import health report is not ready');
    expect(store.getBootstrapSession(session.id)?.status).toBe('import-review');
  });

  test('allows continuing to write once the import health report is ready', () => {
    const store = new RuntimeStore();
    const session = {
      id: 'bootstrap-import-health-ready-001',
      workspaceId: 'workspace-bootstrap-test',
      bookId: 'book-bootstrap-test',
      path: 'import' as const,
      status: 'import-review' as const,
      currentStage: 'import-health-report' as const,
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    };
    store.upsertBootstrapSession(session);
    store.upsertBootstrapRevision({
      id: 'bootstrap-revision-import-health-ready-001',
      sessionId: session.id,
      stage: 'import-health-report',
      createdAt: '2026-08-15T00:01:00.000Z',
      draft: { ready: true, missingArtifacts: [] },
    });

    const result = applyBootstrapCommand({
      store,
      envelope: { ...BASE_ENVELOPE, intent: 'continue-bootstrap-session', systemTaskType: 'continue-bootstrap-session' },
      runId: 'run-bootstrap-import-continue-ready-001',
      payload: { sessionId: session.id },
    });
    expect(result.events.map((event) => event.type)).toEqual(['bootstrap.session.updated', 'bootstrap.ready-to-write']);
    expect(store.getBootstrapSession(session.id)?.status).toBe('ready-to-write');
  });
});
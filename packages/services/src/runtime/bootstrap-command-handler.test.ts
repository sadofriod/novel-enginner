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
    expect(store.getBootstrapSession('bootstrap-session-001')?.currentStage).toBe('project-brief');
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
});
import { describe, expect, test } from 'bun:test';

import { RunEventBus } from '../event-bus';
import { RuntimeStore } from '../store';
import { applyRunControlIntent, publishRunControlEvent } from './run-control';

describe('applyRunControlIntent', () => {
  test('transitions the target run and publishes a run.aborted event', () => {
    const store = new RuntimeStore();
    const eventBus = new RunEventBus();
    store.saveRun({
      runId: 'run-000001',
      commandId: 'cmd-000001',
      workspaceId: 'ws-1',
      bookId: 'book-1',
      intent: 'propose',
      status: 'accepted',
      nextExpectedState: 'proposal-pending',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    applyRunControlIntent(
      {
        workspaceId: 'ws-1',
        bookId: 'book-1',
        targetId: 'run-000001',
        intent: 'abort-run',
        requestedBy: 'user-1',
        approvalMode: 'manual',
        idempotencyKey: 'key-1',
      },
      store,
      eventBus,
      '2026-01-01T00:00:00.000Z',
    );

    expect(store.getRun('run-000001')?.status).toBe('aborted');
    expect(eventBus.history('run-000001').map((event) => event.type)).toContain('run.aborted');
  });

  test('publishes a failure event when the target run is missing', () => {
    const store = new RuntimeStore();
    const eventBus = new RunEventBus();

    applyRunControlIntent(
      {
        workspaceId: 'ws-1',
        bookId: 'book-1',
        targetId: 'run-missing',
        intent: 'abort-run',
        requestedBy: 'user-1',
        approvalMode: 'manual',
        idempotencyKey: 'key-1',
      },
      store,
      eventBus,
      '2026-01-01T00:00:00.000Z',
    );

    expect(eventBus.history('run-missing').map((event) => event.type)).toContain('run.step.failed');
  });
});

describe('publishRunControlEvent', () => {
  test('publishes external.failure for external-failed status', () => {
    const eventBus = new RunEventBus();

    publishRunControlEvent(eventBus, 'run-1', 'mark-external-failure', 'external-failed', '2026-01-01T00:00:00.000Z');

    expect(eventBus.history('run-1').map((event) => event.type)).toContain('external.failure');
  });

  test('publishes nothing for statuses without a mapped event type', () => {
    const eventBus = new RunEventBus();

    publishRunControlEvent(eventBus, 'run-1', 'retry-step', 'running', '2026-01-01T00:00:00.000Z');

    expect(eventBus.history('run-1')).toEqual([]);
  });
});

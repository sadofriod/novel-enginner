import { describe, expect, test } from 'bun:test';

import { RunEventBus } from '../event-bus';
import { RuntimeStore } from '../store';
import { handleCommand } from './handle';
import type { HandleCommandDeps } from './types';

const BASE = {
  workspaceId: 'ws-1',
  bookId: 'book-1',
  artifactType: 'chapter-outline',
  targetId: 'chapter-1',
  intent: 'propose',
  requestedBy: 'user-1',
  approvalMode: 'manual',
  idempotencyKey: 'key-1',
};

function deps(validity: 'clean' | 'dirty' | 'invalid' = 'clean'): HandleCommandDeps {
  return {
    store: new RuntimeStore(),
    eventBus: new RunEventBus(),
    getWorkspaceValidity: () => validity,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('handleCommand', () => {
  test('accepts a valid proposal command and records it', () => {
    const d = deps();
    const result = handleCommand(BASE, d);

    expect(result).toMatchObject({ status: 'accepted', nextExpectedState: 'proposal-pending' });
    expect(d.store.getCommand((result as { commandId: string }).commandId)).toBeDefined();
  });

  test('rejects an invalid envelope without recording', () => {
    const d = deps();
    const result = handleCommand({ ...BASE, targetId: undefined }, d);

    expect(result).toMatchObject({ status: 'rejected', code: 'invalid-command-envelope' });
    expect(d.store.getRun('run-000001')).toBeUndefined();
  });

  test('rejects when the workspace validity guard blocks the intent', () => {
    const d = deps('dirty');
    const result = handleCommand(BASE, d);

    expect(result).toMatchObject({ status: 'rejected' });
  });

  test('returns the same accepted command for an idempotent replay', () => {
    const d = deps();
    const first = handleCommand(BASE, d);
    const second = handleCommand(BASE, d);

    expect(first).toMatchObject({ status: 'accepted' });
    expect(second).toMatchObject({ status: 'accepted' });
    expect((second as { commandId: string }).commandId).toBe((first as { commandId: string }).commandId);
  });

  test('applies run control intents to the target run', () => {
    const d = deps();
    const accepted = handleCommand(BASE, d);
    const runId = (accepted as { runId: string }).runId;

    const abort = handleCommand(
      { ...BASE, intent: 'abort-run', targetId: runId, idempotencyKey: 'key-abort' },
      d,
    );

    expect(abort).toMatchObject({ status: 'accepted' });
    expect(d.store.getRun(runId)?.status).toBe('aborted');
    expect(d.eventBus.history(runId).map((event) => event.type)).toContain('run.aborted');
  });
});

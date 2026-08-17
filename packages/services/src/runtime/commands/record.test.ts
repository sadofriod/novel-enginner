import { describe, expect, test } from 'bun:test';

import type { CommandEnvelope } from '../../domain';
import { RuntimeStore } from '../store';
import { buildAcceptedRecord, resolveExistingCommand, toAcceptedResponse } from './record';

const ENVELOPE: CommandEnvelope = {
  workspaceId: 'ws-1',
  bookId: 'book-1',
  artifactType: 'chapter-outline',
  targetId: 'chapter-1',
  intent: 'propose',
  requestedBy: 'user-1',
  approvalMode: 'manual',
  idempotencyKey: 'key-1',
};

describe('buildAcceptedRecord', () => {
  test('builds an accepted command and run record with the expected next state', () => {
    const { commandRecord, runRecord } = buildAcceptedRecord(ENVELOPE, '2026-01-01T00:00:00.000Z', new RuntimeStore());

    expect(commandRecord.status).toBe('accepted');
    expect(commandRecord.idempotencyKey).toBe('key-1');
    expect(runRecord.intent).toBe('propose');
    expect(runRecord.nextExpectedState).toBe('proposal-pending');
    expect(runRecord.artifactType).toBe('chapter-outline');
    expect(runRecord.targetId).toBe('chapter-1');
  });
});

describe('resolveExistingCommand', () => {
  test('returns undefined when no command matches the idempotency key', () => {
    const store = new RuntimeStore();
    expect(resolveExistingCommand(ENVELOPE, store)).toBeUndefined();
  });

  test('returns an accepted response for an existing command', () => {
    const store = new RuntimeStore();
    const { commandRecord, runRecord } = buildAcceptedRecord(ENVELOPE, '2026-01-01T00:00:00.000Z', store);
    store.saveCommand(commandRecord);
    store.saveRun(runRecord);

    const result = resolveExistingCommand(ENVELOPE, store);

    expect(result?.commandId).toBe(commandRecord.commandId);
    expect(result?.status).toBe('accepted');
  });
});

describe('toAcceptedResponse', () => {
  test('maps command and run onto the accepted response shape', () => {
    const store = new RuntimeStore();
    const { commandRecord, runRecord } = buildAcceptedRecord(ENVELOPE, '2026-01-01T00:00:00.000Z', store);

    const response = toAcceptedResponse(commandRecord, runRecord, ENVELOPE);

    expect(response.status).toBe('accepted');
    expect(response.sseChannel).toBe(`/runs/${runRecord.runId}/stream`);
    expect(response.nextExpectedState).toBe('proposal-pending');
  });
});

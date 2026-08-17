import { describe, expect, test } from 'bun:test';

import { validateCommandEnvelope } from './envelope-validation';

const BASE = {
  workspaceId: 'ws-1',
  bookId: 'book-1',
  intent: 'propose',
  requestedBy: 'user-1',
  approvalMode: 'manual',
  idempotencyKey: 'key-1',
};

describe('validateCommandEnvelope', () => {
  test('accepts a valid proposal intent with artifactType and targetId', () => {
    const result = validateCommandEnvelope({
      ...BASE,
      artifactType: 'chapter-outline',
      targetId: 'chapter-1',
    });

    expect(result).toMatchObject({ ok: true });
  });

  test('accepts a valid system task intent with systemTaskType', () => {
    const result = validateCommandEnvelope({
      ...BASE,
      intent: 're-sync-state',
      systemTaskType: 're-sync-state',
      artifactType: undefined,
      targetId: undefined,
    });

    expect(result).toMatchObject({ ok: true });
  });

  test('rejects a system task intent that sets artifactType', () => {
    const result = validateCommandEnvelope({
      ...BASE,
      intent: 're-sync-state',
      systemTaskType: 're-sync-state',
      artifactType: 'chapter-outline',
    });

    expect(result).toMatchObject({ status: 'rejected', code: 'invalid-command-envelope' });
  });

  test('rejects a system task intent missing systemTaskType', () => {
    const result = validateCommandEnvelope({
      ...BASE,
      intent: 're-sync-state',
      artifactType: undefined,
      targetId: undefined,
    });

    expect(result).toMatchObject({ status: 'rejected' });
  });

  test('rejects a proposal intent missing artifactType', () => {
    const result = validateCommandEnvelope({ ...BASE });

    expect(result).toMatchObject({ status: 'rejected' });
  });

  test('rejects a proposal intent missing targetId', () => {
    const result = validateCommandEnvelope({ ...BASE, artifactType: 'chapter-outline' });

    expect(result).toMatchObject({ status: 'rejected' });
  });

  test('rejects payloads that fail schema validation', () => {
    const result = validateCommandEnvelope({ ...BASE, approvalMode: 'auto' });

    expect(result).toMatchObject({ status: 'rejected' });
  });
});

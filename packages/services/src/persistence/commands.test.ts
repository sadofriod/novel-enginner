import { afterEach, describe, expect, test } from 'bun:test';

import type { CommandRecord } from '../runtime/store';

import { prisma } from './client';
import { findPersistedCommandByIdempotencyKey, persistCommand } from './commands';

const databaseAvailable = process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
const createdRunIds: string[] = [];

const runId = `run-commands-test-${Date.now().toString(36)}`;
const workspaceId = `workspace-commands-test-${Date.now().toString(36)}`;
const bookId = 'book-commands-test';

const command: CommandRecord = {
  commandId: `cmd-commands-test-${Date.now().toString(36)}`,
  runId,
  idempotencyKey: `idempotency-commands-test-${Date.now().toString(36)}`,
  status: 'accepted',
  acceptedAt: new Date().toISOString(),
};

afterEach(async () => {
  if (!databaseAvailable) {
    return;
  }
  await prisma.command.deleteMany({ where: { runId: { in: createdRunIds } } });
});

describe('persistCommand', () => {
  test('round-trips a command and resolves it by idempotency key', async () => {
    if (!databaseAvailable) {
      return;
    }
    createdRunIds.push(runId);
    await persistCommand(workspaceId, bookId, command);

    const restored = await findPersistedCommandByIdempotencyKey(workspaceId, command.idempotencyKey);

    expect(restored?.commandId).toBe(command.commandId);
    expect(restored?.runId).toBe(runId);
    expect(restored?.status).toBe('accepted');
  });
});

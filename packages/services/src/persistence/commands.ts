import type { CommandRecord } from '../runtime/store';

import { prisma } from './client';

export async function persistCommand(
  workspaceId: string,
  bookId: string,
  command: CommandRecord,
): Promise<void> {
  await prisma.command.upsert({
    where: { commandId: command.commandId },
    create: {
      commandId: command.commandId,
      runId: command.runId,
      workspaceId,
      bookId,
      idempotencyKey: command.idempotencyKey,
      status: command.status,
      acceptedAt: new Date(command.acceptedAt),
    },
    update: {
      status: command.status,
    },
  });
}

export async function findPersistedCommandByIdempotencyKey(
  workspaceId: string,
  idempotencyKey: string,
): Promise<CommandRecord | undefined> {
  const row = await prisma.command.findUnique({
    where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } },
  });
  if (row === null) {
    return undefined;
  }
  return {
    commandId: row.commandId,
    runId: row.runId,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    acceptedAt: row.acceptedAt.toISOString(),
  };
}

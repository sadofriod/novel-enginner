import { afterEach, describe, expect, test } from 'bun:test';

import { prisma } from './client';
import {
  findPersistedRun,
  listPersistedRunSteps,
  persistCommand,
  persistRun,
  persistRunStep,
  updatePersistedRunStatus,
} from './operations';
import type { CommandRecord, RunRecord } from '../runtime/store';

const databaseAvailable = process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
const createdRunIds: string[] = [];

const runId = `run-persistence-test-${Date.now().toString(36)}`;
const commandId = `cmd-persistence-test-${Date.now().toString(36)}`;
const workspaceId = `workspace-persistence-test-${Date.now().toString(36)}`;
const bookId = 'book-persistence-test';

const command: CommandRecord = {
  commandId,
  runId,
  idempotencyKey: `idempotency-${commandId}`,
  status: 'accepted',
  acceptedAt: new Date().toISOString(),
};

const run: RunRecord = {
  runId,
  commandId,
  workspaceId,
  bookId,
  artifactType: 'chapter-outline',
  targetId: 'chapter-0001-outline',
  status: 'accepted',
  nextExpectedState: 'proposal-pending',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

afterEach(async () => {
  if (!databaseAvailable) {
    return;
  }
  await prisma.runStep.deleteMany({ where: { runId: { in: createdRunIds } } });
  await prisma.run.deleteMany({ where: { runId: { in: createdRunIds } } });
  await prisma.command.deleteMany({ where: { runId: { in: createdRunIds } } });
});

describe('runtime persistence operations', () => {
  test('round-trips a run, command link, status, and checkpoint step', async () => {
    if (!databaseAvailable) {
      return;
    }
    createdRunIds.push(runId);
    await persistCommand(workspaceId, bookId, command);
    await persistRun(run, 'propose', 'author-local', command.idempotencyKey);
    await persistRunStep({
      runId,
      stepKey: 'create-proposal',
      sequence: 1,
      status: 'completed',
      isCheckpoint: true,
      input: { targetId: run.targetId },
      output: { proposalId: 'proposal-persistence-test' },
      completedAt: new Date(),
    });
    await updatePersistedRunStatus({ runId, status: 'running', nextExpectedState: 'run-resumed' });

    const restoredRun = await findPersistedRun(runId);
    const steps = await listPersistedRunSteps(runId);

    expect(restoredRun?.commandId).toBe(commandId);
    expect(restoredRun?.status).toBe('running');
    expect(restoredRun?.nextExpectedState).toBe('run-resumed');
    expect(steps).toEqual([
      {
        runId,
        stepKey: 'create-proposal',
        sequence: 1,
        status: 'completed',
        isCheckpoint: true,
        input: { targetId: run.targetId },
        output: { proposalId: 'proposal-persistence-test' },
        completedAt: expect.any(String),
      },
    ]);
  });
});

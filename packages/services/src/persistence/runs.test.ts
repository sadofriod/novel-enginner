import { afterEach, describe, expect, test } from 'bun:test';

import type { RunRecord } from '../runtime/store';

import { prisma } from './client';
import {
  findPersistedRun,
  listPersistedRunSteps,
  persistRun,
  persistRunStep,
  updatePersistedRunStatus,
} from './runs';

const databaseAvailable = process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
const createdRunIds: string[] = [];

const runId = `run-runs-test-${Date.now().toString(36)}`;
const workspaceId = `workspace-runs-test-${Date.now().toString(36)}`;
const bookId = 'book-runs-test';

const run: RunRecord = {
  runId,
  commandId: `cmd-runs-test-${Date.now().toString(36)}`,
  workspaceId,
  bookId,
  artifactType: 'chapter-outline',
  targetId: 'chapter-runs-test',
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
});

describe('run persistence', () => {
  test('round-trips a run with a checkpoint step and status update', async () => {
    if (!databaseAvailable) {
      return;
    }
    createdRunIds.push(runId);
    await persistRun(run, 'propose', 'author-local', run.commandId);
    await persistRunStep({
      runId,
      stepKey: 'create-proposal',
      sequence: 1,
      status: 'completed',
      isCheckpoint: true,
      input: { targetId: run.targetId },
    });
    await updatePersistedRunStatus({ runId, status: 'running', nextExpectedState: 'run-resumed' });

    const restored = await findPersistedRun(runId);
    const steps = await listPersistedRunSteps(runId);

    expect(restored?.status).toBe('running');
    expect(restored?.nextExpectedState).toBe('run-resumed');
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual(
      expect.objectContaining({
        runId,
        stepKey: 'create-proposal',
        sequence: 1,
        status: 'completed',
        isCheckpoint: true,
        input: { targetId: run.targetId },
      }),
    );
  });
});

/* eslint-disable complexity */
import { Prisma } from '@prisma/client';
import type { RunRecord } from '../runtime/store';

import { prisma } from './client';

function toPrismaJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : value as Prisma.InputJsonValue;
}

export async function persistRun(
  run: RunRecord,
  commandIntent: string,
  requestedBy: string,
  idempotencyKey: string,
  basedOnCanonicalVersion?: string,
): Promise<void> {
  await prisma.run.upsert({
    where: { runId: run.runId },
    create: {
      runId: run.runId,
      workspaceId: run.workspaceId,
      bookId: run.bookId,
      commandIntent,
      ...(run.artifactType !== undefined ? { artifactType: run.artifactType } : {}),
      ...(run.targetId !== undefined ? { targetId: run.targetId } : {}),
      status: run.status,
      nextExpectedState: run.nextExpectedState,
      requestedBy,
      idempotencyKey,
      ...(basedOnCanonicalVersion !== undefined ? { basedOnCanonicalVersion } : {}),
    },
    update: {
      status: run.status,
      nextExpectedState: run.nextExpectedState,
      ...(run.artifactType !== undefined ? { artifactType: run.artifactType } : {}),
      ...(run.targetId !== undefined ? { targetId: run.targetId } : {}),
      ...(basedOnCanonicalVersion !== undefined ? { basedOnCanonicalVersion } : {}),
    },
  });
}

export async function updatePersistedRunStatus(input: {
  readonly runId: string;
  readonly status: string;
  readonly nextExpectedState: string;
  readonly driftReason?: string;
}): Promise<void> {
  await prisma.run.update({
    where: { runId: input.runId },
    data: {
      status: input.status,
      nextExpectedState: input.nextExpectedState,
      ...(input.driftReason !== undefined ? { driftReason: input.driftReason } : {}),
      ...(input.status === 'completed' || input.status === 'aborted' || input.status === 'external-failed'
        ? { completedAt: new Date() }
        : {}),
    },
  });
}

export interface PersistRunStepInput {
  readonly runId: string;
  readonly stepKey: string;
  readonly sequence: number;
  readonly status: string;
  readonly isCheckpoint?: boolean;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly errorReason?: string;
  readonly completedAt?: Date;
}

export async function persistRunStep(input: PersistRunStepInput): Promise<void> {
  await prisma.runStep.upsert({
    where: { runId_sequence: { runId: input.runId, sequence: input.sequence } },
    create: {
      runId: input.runId,
      stepKey: input.stepKey,
      sequence: input.sequence,
      status: input.status,
      isCheckpoint: input.isCheckpoint ?? false,
      ...(input.input !== undefined ? { input: toPrismaJsonInput(input.input) } : {}),
      ...(input.output !== undefined ? { output: toPrismaJsonInput(input.output) } : {}),
      ...(input.errorReason !== undefined ? { errorReason: input.errorReason } : {}),
      ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
    },
    update: {
      stepKey: input.stepKey,
      status: input.status,
      isCheckpoint: input.isCheckpoint ?? false,
      ...(input.input !== undefined ? { input: toPrismaJsonInput(input.input) } : {}),
      ...(input.output !== undefined ? { output: toPrismaJsonInput(input.output) } : {}),
      ...(input.errorReason !== undefined ? { errorReason: input.errorReason } : {}),
      ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
    },
  });
}

export interface PersistedRunStep {
  readonly runId: string;
  readonly stepKey: string;
  readonly sequence: number;
  readonly status: string;
  readonly isCheckpoint: boolean;
  readonly input: unknown;
  readonly output: unknown;
  readonly errorReason?: string;
  readonly completedAt?: string;
}

export async function listPersistedRunSteps(runId: string): Promise<readonly PersistedRunStep[]> {
  const rows = await prisma.runStep.findMany({ where: { runId }, orderBy: { sequence: 'asc' } });
  return rows.map((row) => ({
    runId: row.runId,
    stepKey: row.stepKey,
    sequence: row.sequence,
    status: row.status,
    isCheckpoint: row.isCheckpoint,
    input: row.input,
    output: row.output,
    ...(row.errorReason !== null ? { errorReason: row.errorReason } : {}),
    ...(row.completedAt !== null ? { completedAt: row.completedAt.toISOString() } : {}),
  }));
}

export async function findPersistedRun(runId: string): Promise<RunRecord | undefined> {
  const row = await prisma.run.findUnique({ where: { runId } });
  if (row === null) {
    return undefined;
  }
  const command = await prisma.command.findUnique({ where: { runId } });
  return {
    runId: row.runId,
    commandId: command?.commandId ?? '',
    workspaceId: row.workspaceId,
    bookId: row.bookId,
    ...(row.artifactType !== null
      ? { artifactType: row.artifactType as NonNullable<RunRecord['artifactType']> }
      : {}),
    ...(row.targetId !== null ? { targetId: row.targetId } : {}),
    status: row.status,
    nextExpectedState: row.nextExpectedState ?? 'unknown',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listPersistedRuns(): Promise<readonly RunRecord[]> {
  const rows = await prisma.run.findMany({ orderBy: { createdAt: 'desc' } });
  return Promise.all(rows.map(async (row) => {
    const command = await prisma.command.findUnique({ where: { runId: row.runId } });
    return {
      runId: row.runId,
      commandId: command?.commandId ?? '',
      workspaceId: row.workspaceId,
      bookId: row.bookId,
      ...(row.artifactType === null ? {} : { artifactType: row.artifactType as NonNullable<RunRecord['artifactType']> }),
      ...(row.targetId === null ? {} : { targetId: row.targetId }),
      status: row.status,
      nextExpectedState: row.nextExpectedState ?? 'unknown',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }));
}

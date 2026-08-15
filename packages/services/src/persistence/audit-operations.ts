/* eslint-disable complexity */

import type { CapabilityRegistrationState } from '../domain';

import { prisma } from './client';
import { toCapabilityDiscoverySnapshotCreateInput } from './mappers';

export async function persistCapabilitySnapshot(
  snapshotId: string,
  workspaceId: string,
  state: CapabilityRegistrationState,
): Promise<void> {
  const data = toCapabilityDiscoverySnapshotCreateInput(snapshotId, workspaceId, state);
  await prisma.capabilityDiscoverySnapshot.upsert({
    where: { snapshotId },
    create: data,
    update: {
      status: data.status,
      ...(data.details !== undefined ? { details: data.details } : {}),
    },
  });
}

export async function persistCapabilitySnapshots(
  workspaceId: string,
  states: readonly CapabilityRegistrationState[],
): Promise<void> {
  // Use a single timestamp nonce computed before the map so that all IDs in the same
  // batch are unique even when two states share the same index-modulo window.
  const batchNonce = Date.now().toString(36);
  await Promise.all(
    states.map((state, index) => {
      const snapshotId = `${workspaceId}-cap-${index.toString().padStart(4, '0')}-${batchNonce}`;
      return persistCapabilitySnapshot(snapshotId, workspaceId, state);
    }),
  );
}

export interface SyntheticCommitInput {
  readonly syntheticCommitId: string;
  readonly workspaceId: string;
  readonly bookId: string;
  readonly targetFilePaths: readonly string[];
  readonly canonicalVersion: string;
  readonly message: string;
}

/**
 * Persists a synthetic commit audit record generated during a `re-sync-state` pass,
 * per docs/architecture/modules/07-api-events-and-runtime.md §7.9:
 * "手工改动经 re-sync-state 进入系统时，也要生成一条合成 commit 审计记录".
 */
export async function persistSyntheticCommit(input: SyntheticCommitInput): Promise<void> {
  await prisma.syntheticCommit.upsert({
    where: { syntheticCommitId: input.syntheticCommitId },
    create: {
      syntheticCommitId: input.syntheticCommitId,
      workspaceId: input.workspaceId,
      bookId: input.bookId,
      targetFilePaths: input.targetFilePaths,
      canonicalVersion: input.canonicalVersion,
      message: input.message,
    },
    update: {},
  });
}

export interface DerivedRebuildJobInput {
  readonly jobId: string;
  readonly workspaceId: string;
  readonly bookId: string;
  readonly jobType: string;
  readonly status: string;
  readonly triggeredBy?: string;
  readonly runId?: string;
  readonly errorReason?: string;
}

export async function persistDerivedRebuildJob(input: DerivedRebuildJobInput): Promise<void> {
  await prisma.derivedRebuildJob.upsert({
    where: { jobId: input.jobId },
    create: {
      jobId: input.jobId,
      workspaceId: input.workspaceId,
      bookId: input.bookId,
      jobType: input.jobType,
      status: input.status,
      ...(input.triggeredBy !== undefined ? { triggeredBy: input.triggeredBy } : {}),
      ...(input.runId !== undefined ? { runId: input.runId } : {}),
      ...(input.errorReason !== undefined ? { errorReason: input.errorReason } : {}),
      ...(input.status === 'running' ? { startedAt: new Date() } : {}),
      ...(input.status === 'completed' || input.status === 'failed' ? { completedAt: new Date() } : {}),
    },
    update: {
      status: input.status,
      ...(input.errorReason !== undefined ? { errorReason: input.errorReason } : {}),
      ...(input.status === 'running' ? { startedAt: new Date() } : {}),
      ...(input.status === 'completed' || input.status === 'failed' ? { completedAt: new Date() } : {}),
    },
  });
}

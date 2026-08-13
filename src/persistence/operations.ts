/**
 * Prisma-backed CRUD operations for the runtime/audit persistence layer.
 * (docs/architecture/modules/07-api-events-and-runtime.md §7.8,
 *  docs/architecture/modules/10-v1-execution-plan.md Phase 4)
 *
 * Canonical state (books, volumes, characters, …) lives in the filesystem and is never
 * duplicated here. Only the runtime/audit layer (proposals, runs, reviewer results,
 * override audits, capability snapshots) is persisted via Prisma.
 */
import type { Proposal, ReviewerResult, OverrideAudit, CapabilityRegistrationState } from '../domain';

import { prisma } from './client';
import {
  fromProposalRow,
  toCapabilityDiscoverySnapshotCreateInput,
  toOverrideAuditCreateInput,
  toProposalCreateInput,
  toReviewerResultCreateInput,
  type ProposalRow,
} from './mappers';

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export async function persistProposal(
  workspaceId: string,
  bookId: string,
  proposal: Proposal,
): Promise<void> {
  const data = toProposalCreateInput(workspaceId, bookId, proposal);
  await prisma.proposal.upsert({
    where: { proposalId: data.proposalId },
    create: data,
    update: {
      status: data.status,
      latestReviewResultId: data.latestReviewResultId,
      overrideAuditId: data.overrideAuditId,
      supersedesProposalId: data.supersedesProposalId,
      bundledDiffRefs: data.bundledDiffRefs,
    },
  });
}

export async function findProposal(proposalId: string): Promise<Proposal | undefined> {
  const row = await prisma.proposal.findUnique({ where: { proposalId } });
  return row === null ? undefined : fromProposalRow(row as unknown as ProposalRow);
}

export async function listActiveProposalsForWorkspace(workspaceId: string): Promise<readonly Proposal[]> {
  const rows = await prisma.proposal.findMany({
    where: {
      workspaceId,
      status: {
        notIn: ['rejected', 'superseded', 'exported', 'deleted'],
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row: unknown) => fromProposalRow(row as unknown as ProposalRow));
}

// ---------------------------------------------------------------------------
// Reviewer results
// ---------------------------------------------------------------------------

export async function persistReviewerResult(
  reviewResultId: string,
  proposalId: string,
  result: ReviewerResult,
): Promise<void> {
  const data = toReviewerResultCreateInput(reviewResultId, proposalId, result);
  await prisma.reviewerResult.upsert({
    where: { reviewResultId },
    create: data,
    update: {
      approved: data.approved,
      hardFailures: data.hardFailures,
      dimensionScores: data.dimensionScores,
      totalScore: data.totalScore,
      rewriteDirectives: data.rewriteDirectives,
      overrideEligible: data.overrideEligible,
    },
  });
}

// ---------------------------------------------------------------------------
// Override audits
// ---------------------------------------------------------------------------

export async function persistOverrideAudit(
  overrideAuditId: string,
  proposalId: string,
  audit: OverrideAudit,
): Promise<void> {
  const data = toOverrideAuditCreateInput(overrideAuditId, proposalId, audit);
  await prisma.overrideAudit.upsert({
    where: { overrideAuditId },
    create: data,
    update: {},
  });
}

// ---------------------------------------------------------------------------
// Capability discovery snapshots
// ---------------------------------------------------------------------------

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
      details: data.details,
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

// ---------------------------------------------------------------------------
// Synthetic commits
// ---------------------------------------------------------------------------

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

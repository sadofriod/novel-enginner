import type { Proposal } from '../domain';

export interface CreateOptimizeProposalInput {
  readonly artifactType: Proposal['artifactType'];
  readonly targetId: string;
  readonly runId: string;
  readonly snapshotId: string;
}

/**
 * Builds the proposal record for an LLM-optimized artifact. The proposal is marked
 * `origin: 'generated'` so the approval queue can distinguish system-optimized
 * content from author-typed content, and enters `pending-approval` so the author
 * reviews the optimized output before it can commit.
 */
export function createOptimizeProposal(input: CreateOptimizeProposalInput): Proposal {
  return {
    proposalId: `proposal-${input.runId}`,
    artifactType: input.artifactType,
    targetId: input.targetId,
    status: 'pending-approval',
    intent: 'optimize',
    origin: 'generated',
    basedOnCanonicalVersion: input.snapshotId,
    parentRunId: input.runId,
  };
}

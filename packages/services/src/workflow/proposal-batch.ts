import type { CommandEnvelope, Proposal, ReviewerResult } from '../domain';
import type { WorkspaceValidity } from '../domain/values';

import { applyProposalCommand } from './command-lifecycle';

export type BatchApprovalOutcome =
  | { readonly proposalId: string; readonly accepted: true; readonly proposal: Proposal; readonly canCommit: boolean }
  | { readonly proposalId: string; readonly accepted: false; readonly reason: string };

export interface ApproveProposalBatchInput {
  readonly envelope: CommandEnvelope;
  readonly proposals: readonly Proposal[];
  /** Shared book-level snapshot all proposals are evaluated against. */
  readonly currentCanonicalVersion: string;
  readonly workspaceValidity: WorkspaceValidity;
  /** Reviewer results keyed by proposalId, resolved by the caller. */
  readonly reviewerResults?: ReadonlyMap<string, ReviewerResult>;
  readonly requireReviewerResult?: boolean;
}

/**
 * Evaluates a batch of proposals for approval against a single shared snapshot.
 * Each proposal goes through the exact same decision pipeline as a single
 * `approve` command (`applyProposalCommand`), so approval semantics — snapshot
 * drift, review gating, workspace commit status — stay identical for batch and
 * single approval. Pure: callers resolve and persist per-item outcomes.
 */
export function approveProposalBatch(input: ApproveProposalBatchInput): readonly BatchApprovalOutcome[] {
  return input.proposals.map((proposal) => {
    const reviewerResult = input.reviewerResults?.get(proposal.proposalId);
    const decision = applyProposalCommand({
      envelope: {
        ...input.envelope,
        intent: 'approve',
        artifactType: proposal.artifactType,
        targetId: proposal.targetId,
      },
      proposal,
      currentCanonicalVersion: input.currentCanonicalVersion,
      workspaceValidity: input.workspaceValidity,
      ...(reviewerResult === undefined ? {} : { reviewerResult }),
      ...(input.requireReviewerResult === undefined ? {} : { requireReviewerResult: input.requireReviewerResult }),
    });
    if (!decision.accepted) {
      return { proposalId: proposal.proposalId, accepted: false, reason: decision.reason };
    }
    return { proposalId: proposal.proposalId, accepted: true, proposal: decision.proposal, canCommit: decision.canCommit };
  });
}

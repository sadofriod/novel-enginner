import type {
  NewReviewThread,
  Proposal,
  ProposalReview,
  ReviewComment,
  ReviewThread,
  SubmitReviewInput,
} from '../domain/schema';
import type { ProposalStatus } from '../domain/values';

/**
 * Pure proposal-review workflow rules (GitHub PR-review style): line-anchored
 * review threads, atomic submit, and chain-wide approve gating. These helpers
 * hold no I/O — callers load/persist via `src/persistence` and re-run the pure
 * transitions against loaded state.
 */

export class ReviewWorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewWorkflowError';
  }
}

const REVIEWABLE_PROPOSAL_STATUSES: ReadonlySet<ProposalStatus> = new Set([
  'pending-approval',
  'pending-review',
]);

export function isReviewableProposalStatus(status: ProposalStatus): boolean {
  return REVIEWABLE_PROPOSAL_STATUSES.has(status);
}

/** A proposal may only be moved to `changes-requested` while reviewable. */
export function applySubmitReview(proposal: Proposal, review: ProposalReview): Proposal {
  if (review.proposalId !== proposal.proposalId) {
    throw new ReviewWorkflowError(
      `review '${review.reviewId}' does not target proposal '${proposal.proposalId}'`,
    );
  }
  if (!isReviewableProposalStatus(proposal.status)) {
    throw new ReviewWorkflowError(
      `proposal '${proposal.proposalId}' is not reviewable in status '${proposal.status}'`,
    );
  }
  return { ...proposal, status: 'changes-requested' };
}

export interface SubmitReviewResult {
  readonly review: ProposalReview;
  readonly threads: readonly ReviewThread[];
  readonly comments: readonly ReviewComment[];
}

/** Injectable identity/clock so the assembler stays pure and deterministic in tests. */
export interface IdentityAndTime {
  readonly id: () => string;
  readonly now: () => string;
}

export function hasSubmitReviewContent(input: SubmitReviewInput): boolean {
  return (
    input.newThreads.length > 0 || input.replies.length > 0 || input.overallComment !== undefined
  );
}

function buildThread(
  draft: NewReviewThread,
  threadId: string,
  now: string,
): ReviewThread {
  return {
    threadId,
    proposalId: draft.proposalId,
    field: draft.field,
    side: draft.side,
    lineNumber: draft.lineNumber,
    ...(draft.lineCount === undefined ? {} : { lineCount: draft.lineCount }),
    lineSnapshot: draft.lineSnapshot,
    isResolved: false,
    createdAt: now,
  };
}

/** Assembles one atomic review submission into its review + threads + comments. */
export function buildSubmitReview(
  input: SubmitReviewInput,
  identity: IdentityAndTime,
): SubmitReviewResult {
  if (!hasSubmitReviewContent(input)) {
    throw new ReviewWorkflowError('submit review requires at least one comment or an overall comment');
  }
  const review: ProposalReview = {
    reviewId: identity.id(),
    proposalId: input.proposalId,
    disposition: 'request-changes',
    ...(input.overallComment === undefined ? {} : { overallComment: input.overallComment }),
    submittedAt: identity.now(),
  };
  const threads: ReviewThread[] = [];
  const comments: ReviewComment[] = [];
  for (const draft of input.newThreads) {
    const threadId = identity.id();
    threads.push(buildThread(draft, threadId, identity.now()));
    comments.push({
      commentId: identity.id(),
      threadId,
      author: input.author,
      body: draft.body,
      createdAt: identity.now(),
    });
  }
  for (const reply of input.replies) {
    comments.push({
      commentId: identity.id(),
      threadId: reply.threadId,
      author: input.author,
      body: reply.body,
      createdAt: identity.now(),
    });
  }
  return { review, threads, comments };
}

export function resolveThread(thread: ReviewThread, by: string, at: string): ReviewThread {
  if (thread.isResolved) {
    return thread;
  }
  return { ...thread, isResolved: true, resolvedBy: by, resolvedAt: at };
}

export function unresolveThread(thread: ReviewThread): ReviewThread {
  if (!thread.isResolved) {
    return thread;
  }
  return {
    threadId: thread.threadId,
    proposalId: thread.proposalId,
    field: thread.field,
    side: thread.side,
    lineNumber: thread.lineNumber,
    lineSnapshot: thread.lineSnapshot,
    isResolved: false,
    createdAt: thread.createdAt,
  };
}

/** Walks the supersedes chain from the current proposal back to the oldest round. */
export function buildProposalChain(
  proposals: readonly Proposal[],
  startProposalId: string,
): readonly Proposal[] {
  const byId = new Map(proposals.map((entry) => [entry.proposalId, entry] as const));
  const chain: Proposal[] = [];
  let current = byId.get(startProposalId);
  while (current !== undefined) {
    chain.push(current);
    current =
      current.supersedesProposalId === undefined
        ? undefined
        : byId.get(current.supersedesProposalId);
  }
  return chain;
}

export function countUnresolvedThreads(threads: readonly ReviewThread[]): number {
  let count = 0;
  for (const thread of threads) {
    if (!thread.isResolved) {
      count += 1;
    }
  }
  return count;
}

/** Counts unresolved threads across every round of the supersedes chain. */
export function countUnresolvedThreadsForProposals(
  threadsByProposal: ReadonlyMap<string, readonly ReviewThread[]>,
  proposals: readonly Proposal[],
  startProposalId: string,
): number {
  const chain = buildProposalChain(proposals, startProposalId);
  let count = 0;
  for (const proposal of chain) {
    count += countUnresolvedThreads(threadsByProposal.get(proposal.proposalId) ?? []);
  }
  return count;
}

/**
 * Approve gating: unresolved threads block approve unless this is an explicit
 * override-approve (which is exempt and recorded in the audit trail).
 */
export function isApproveBlockedByUnresolvedThreads(
  unresolvedCount: number,
  isOverride: boolean,
): boolean {
  if (isOverride) {
    return false;
  }
  return unresolvedCount > 0;
}

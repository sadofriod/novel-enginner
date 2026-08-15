import type { Proposal, StableId } from '../domain/schema';
import type { ProposalArtifactType, ProposalStatus, WorkspaceValidity } from '../domain/values';

/**
 * Pure proposal lifecycle rules for the v1 workflow skeleton
 * (docs/architecture/modules/07-api-events-and-runtime.md §7.4.2 and
 * docs/architecture/modules/10-v1-execution-plan.md §10.7).
 *
 * These helpers intentionally hold no I/O: callers (Bun API handlers, CLI
 * commands, Inngest workflow steps) are responsible for loading/persisting
 * `Proposal` rows via `src/persistence` and re-running these pure
 * transitions against the loaded state.
 */

const TERMINAL_PROPOSAL_STATUSES: ReadonlySet<ProposalStatus> = new Set([
  'rejected',
  'superseded',
  'exported',
  'deleted',
]);

function proposalTargetKey(artifactType: ProposalArtifactType, targetId: StableId): string {
  return `${artifactType}::${targetId}`;
}

export function isTerminalProposalStatus(status: ProposalStatus): boolean {
  return TERMINAL_PROPOSAL_STATUSES.has(status);
}

/** An active proposal is one that has not reached a terminal status yet. */
export function isActiveProposal(proposal: Proposal): boolean {
  return !isTerminalProposalStatus(proposal.status);
}

export interface ProposalRegistry {
  /** Active (non-terminal) proposal keyed by `artifactType::targetId`. */
  readonly activeByTarget: ReadonlyMap<string, Proposal>;
}

export function buildProposalRegistry(proposals: readonly Proposal[]): ProposalRegistry {
  const activeByTarget = new Map<string, Proposal>();
  for (const proposal of proposals) {
    if (!isActiveProposal(proposal)) {
      continue;
    }
    activeByTarget.set(proposalTargetKey(proposal.artifactType, proposal.targetId), proposal);
  }
  return { activeByTarget };
}

export function findActiveProposalForTarget(
  registry: ProposalRegistry,
  artifactType: ProposalArtifactType,
  targetId: StableId,
): Proposal | undefined {
  return registry.activeByTarget.get(proposalTargetKey(artifactType, targetId));
}

export interface CreateProposalInput {
  readonly proposal: Proposal;
  readonly registry: ProposalRegistry;
}

export interface CreateProposalResult {
  /** The newly created proposal, with `supersedesProposalId` filled in when applicable. */
  readonly created: Proposal;
  /** The previously active proposal for the same target, now marked `superseded`, if any. */
  readonly superseded?: Proposal;
}

/**
 * docs/architecture/modules/07-api-events-and-runtime.md §7.4.2:
 * "当同一 artifactType + targetId 再次发起 propose 或 regenerate 时，新 proposal
 * 自动 supersede 旧活跃 proposal."
 */
export function createProposal({ proposal, registry }: CreateProposalInput): CreateProposalResult {
  const previousActive = findActiveProposalForTarget(registry, proposal.artifactType, proposal.targetId);

  if (previousActive === undefined) {
    return { created: proposal };
  }
  if (previousActive.proposalId === proposal.proposalId) {
    return { created: proposal };
  }

  const superseded: Proposal = { ...previousActive, status: 'superseded' };
  const created: Proposal = { ...proposal, supersedesProposalId: previousActive.proposalId };
  return { created, superseded };
}

export interface ApprovabilityRejection {
  readonly eligible: false;
  readonly reason: 'snapshot-drift' | 'not-pending-approval';
  readonly message: string;
}

export interface ApprovabilityApproval {
  readonly eligible: true;
}

export type ApprovabilityResult = ApprovabilityRejection | ApprovabilityApproval;

/**
 * docs/architecture/modules/07-api-events-and-runtime.md §7.4.2:
 * "basedOnCanonicalVersion 一旦落后于当前书级快照，proposal 就不能直接进入
 * canonical 写入路径."
 */
export function evaluateApprovability(
  proposal: Proposal,
  currentCanonicalVersion: StableId,
): ApprovabilityResult {
  if (proposal.status !== 'pending-approval' && proposal.status !== 'pending-review') {
    return {
      eligible: false,
      reason: 'not-pending-approval',
      message: `Proposal "${proposal.proposalId}" is not awaiting approval (status: ${proposal.status}).`,
    };
  }

  if (proposal.basedOnCanonicalVersion !== currentCanonicalVersion) {
    return {
      eligible: false,
      reason: 'snapshot-drift',
      message:
        `Proposal "${proposal.proposalId}" is based on canonical version ` +
        `"${proposal.basedOnCanonicalVersion}" which is stale relative to current ` +
        `"${currentCanonicalVersion}"; regenerate before it can be approved.`,
    };
  }

  return { eligible: true };
}

export interface DecideApprovalInput {
  readonly proposal: Proposal;
  readonly currentCanonicalVersion: StableId;
  /** `true` for `override-approve`, `false` for a normal `approve`. */
  readonly isOverride: boolean;
  readonly overrideAuditId?: StableId;
}

export interface ApprovalDecisionAccepted {
  readonly accepted: true;
  readonly proposal: Proposal;
}

export interface ApprovalDecisionRejected {
  readonly accepted: false;
  readonly reason: ApprovabilityRejection['reason'];
  readonly message: string;
}

export type ApprovalDecisionResult = ApprovalDecisionAccepted | ApprovalDecisionRejected;

/**
 * Applies `approve` / `override-approve` intent semantics. Only these two
 * intents may move a proposal towards a canonical write
 * (docs/architecture/modules/07-api-events-and-runtime.md §7.9).
 */
export function decideApproval(input: DecideApprovalInput): ApprovalDecisionResult {
  const eligibility = evaluateApprovability(input.proposal, input.currentCanonicalVersion);
  if (!eligibility.eligible) {
    return { accepted: false, reason: eligibility.reason, message: eligibility.message };
  }

  const nextStatus: ProposalStatus = input.isOverride ? 'override-approved' : 'approved';
  const proposal: Proposal = {
    ...input.proposal,
    status: nextStatus,
    ...(input.isOverride && input.overrideAuditId !== undefined
      ? { overrideAuditId: input.overrideAuditId }
      : {}),
  };
  return { accepted: true, proposal };
}

export function rejectProposal(proposal: Proposal): Proposal {
  return { ...proposal, status: 'rejected' };
}

export interface CommitAttemptResult {
  /** `true` when the canonical write may proceed now. */
  readonly canCommit: boolean;
  readonly proposal: Proposal;
}

/**
 * Gates the canonical-commit step of an approved proposal behind workspace
 * validity (docs/architecture/modules/10-v1-execution-plan.md §10.7):
 * - `clean`: the write may proceed; proposal keeps its approved status.
 * - `dirty`: recoverable soon; proposal moves to `waiting-sync`.
 * - `invalid`: requires manual intervention; proposal moves to `commit-blocked`.
 */
export function attemptCanonicalCommit(
  proposal: Proposal,
  workspaceValidity: WorkspaceValidity,
): CommitAttemptResult {
  if (proposal.status !== 'approved' && proposal.status !== 'override-approved') {
    return { canCommit: false, proposal };
  }

  if (workspaceValidity === 'clean') {
    return { canCommit: true, proposal };
  }

  const blockedStatus: ProposalStatus = workspaceValidity === 'invalid' ? 'commit-blocked' : 'waiting-sync';
  return { canCommit: false, proposal: { ...proposal, status: blockedStatus } };
}

/**
 * Once the workspace recovers to `clean`, a blocked proposal re-enters the
 * pending-confirmation queue rather than auto-committing
 * (docs/architecture/modules/10-v1-execution-plan.md §10.7 acceptance:
 * "工作区恢复后进入待确认队列").
 */
export function requeueAfterWorkspaceRecovery(
  proposal: Proposal,
  workspaceValidity: WorkspaceValidity,
): Proposal {
  const isBlocked = proposal.status === 'commit-blocked' || proposal.status === 'waiting-sync';
  if (!isBlocked || workspaceValidity !== 'clean') {
    return proposal;
  }

  const nextStatus: ProposalStatus =
    proposal.overrideAuditId !== undefined ? 'override-approved' : 'approved';
  return { ...proposal, status: nextStatus };
}

/**
 * `export-draft` is an explicit terminal action for a proposal
 * (docs/architecture/modules/07-api-events-and-runtime.md §7.4.2): manual
 * deep edits must flow back in through a brand new proposal, never by
 * reviving this one.
 */
export function exportDraft(proposal: Proposal): Proposal {
  return { ...proposal, status: 'exported' };
}

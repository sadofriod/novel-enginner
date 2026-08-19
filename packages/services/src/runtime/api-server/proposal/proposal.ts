/* eslint-disable complexity */
import type { CommandEnvelope, Proposal, ReviewerResult } from '../../../domain';
import type { WorkspaceValidity } from '../../../domain/values';
import { assembleReviewerResult, DEFAULT_REVIEWER_RULE_THRESHOLDS } from '../../../agent/reviewer';
import { requestReviewerModelEvidence } from '../../../agent/reviewer-agent';
import { resolveRoleTemplate } from '../../../agent/role-template';
import { loadReviewerRules } from '../../../agent/reviewer-rules-loader';
import { findActiveProposalForTarget, findPersistedCanonicalDraft, findPersistedReviewerResult, persistProposal } from '../../../persistence/operations';
import { findProposal } from '../../../persistence/proposals';
import { applyProposalCommand } from '../../../workflow/command-lifecycle';
import { approveProposalBatch } from '../../../workflow/proposal-batch';
import { requiresModelEvidence } from '../../../workflow/proposal-lifecycle';
import { commitCanonicalBundle } from '../../../workspace/canonical-commit';
import { withCanonicalCommitLane } from '../../../workspace/canonical-commit-lane';
import { readCanonicalWorkspaceFiles } from '../../../workspace/file-watcher';
import { reSyncState } from '../../../workspace/sync-engine';
import { finalizeBootstrapArtifactApproval, hasBootstrapApprovalSession, isBootstrapArtifactType } from '../../bootstrap-initializer';
import { createApprovedCanonicalDraft } from '../../canonical-draft';
import type { CommandResult, } from '../../command-handler';
import { RunEventBus } from '../../event-bus';
import { RuntimeStore } from '../../store';
import type { CreateApiServerOptions } from '../types';

export function syncArtifactSummary(store: RuntimeStore, _eventBus: RunEventBus, envelope: CommandEnvelope, result: CommandResult): void {
  if (result.status !== 'accepted' || envelope.artifactType === undefined || envelope.targetId === undefined) return;
  const existing = store.getArtifact(envelope.artifactType, envelope.targetId);
  // Derive proposal state from the actual active proposal so the artifact summary
  // never reports a pending status that has no backing Proposal record, and always
  // reflects the proposal's real lifecycle status (pending-review → pending-approval
  // → approved / rejected / …) instead of a hardcoded value.
  const proposal = store.getActiveProposal(envelope.artifactType, envelope.targetId);
  store.upsertArtifact({
    ...existing,
    artifactType: envelope.artifactType,
    targetId: envelope.targetId,
    canonicalStatus: existing?.canonicalStatus ?? 'draft',
    ...(proposal === undefined ? {} : { activeProposalId: proposal.proposalId, proposalStatus: proposal.status }),
    updatedAt: result.acceptedAt,
  });
}

export interface InlineEditOutcome {
  readonly wasApprovedBeforeEdit: boolean;
  readonly activeProposalId?: string;
}

export function handleInlineEdit(store: RuntimeStore, artifactType: string, targetId: string, inlineEditNote: string): InlineEditOutcome | undefined {
  const artifact = store.getArtifact(artifactType, targetId);
  if (artifact === undefined) {
    return undefined;
  }
  const wasApprovedBeforeEdit = artifact.proposalStatus === 'approved' || artifact.proposalStatus === 'override-approved';
  store.upsertArtifact({ ...artifact, inlineEditNote, reviewStale: true, updatedAt: new Date().toISOString() });
  return { wasApprovedBeforeEdit, ...(artifact.activeProposalId === undefined ? {} : { activeProposalId: artifact.activeProposalId }) };
}

export async function applyPersistedProposalDecision(input: { readonly store: RuntimeStore; readonly eventBus: RunEventBus; readonly envelope: CommandEnvelope; readonly runId: string; readonly getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity; readonly options: CreateApiServerOptions }): Promise<void> {
  if (!['approve', 'reject', 'override-approve', 'export-draft'].includes(input.envelope.intent) || input.envelope.artifactType === undefined || input.envelope.targetId === undefined) return;
  const persistenceEnabled = process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
  const proposal = input.options.loadActiveProposal !== undefined ? await input.options.loadActiveProposal(input.envelope.workspaceId, input.envelope.bookId, input.envelope.artifactType, input.envelope.targetId) : persistenceEnabled ? await findActiveProposalForTarget(input.envelope.workspaceId, input.envelope.bookId, input.envelope.artifactType, input.envelope.targetId) : input.store.getActiveProposal(input.envelope.artifactType, input.envelope.targetId);
  const snapshot = input.store.getLastKnownSnapshot(input.envelope.workspaceId);
  if (proposal === undefined || snapshot === undefined) { input.eventBus.publish({ type: 'run.step.failed', runId: input.runId, emittedAt: new Date().toISOString(), data: { reason: proposal === undefined ? 'active proposal not found' : 'canonical snapshot not found' } }); return; }
  const reviewed = await ensureModelEvidenceReview({ proposal, store: input.store, options: input.options, persistenceEnabled });
  const reviewerResult = reviewed.reviewerResult ?? (await loadReviewerResult(reviewed.proposal, input.options, persistenceEnabled, input.store)).reviewerResult;
  const decision = applyProposalCommand({ envelope: input.envelope, proposal: reviewed.proposal, currentCanonicalVersion: snapshot.snapshotId, workspaceValidity: input.getWorkspaceValidity(input.envelope.workspaceId), ...(reviewerResult === undefined ? {} : { reviewerResult }), requireReviewerResult: persistenceEnabled || input.options.loadReviewerResult !== undefined });
  if (!decision.accepted) { input.eventBus.publish({ type: 'run.step.failed', runId: input.runId, emittedAt: new Date().toISOString(), data: { reason: decision.reason } }); return; }
  // Keep the in-memory proposal in sync with the decision so the approval queue
  // (which derives artifact state from the store) reflects the real lifecycle status.
  input.store.saveProposal(decision.proposal);
  if (input.options.persistProposalDecision !== undefined) await input.options.persistProposalDecision(input.envelope.workspaceId, input.envelope.bookId, decision.proposal);
  else if (persistenceEnabled) await persistProposal(input.envelope.workspaceId, input.envelope.bookId, decision.proposal);
  else input.store.saveProposal(decision.proposal);
  await commitProposalDecision({
    store: input.store,
    eventBus: input.eventBus,
    envelope: input.envelope,
    runId: input.runId,
    getWorkspaceValidity: input.getWorkspaceValidity,
    options: input.options,
    proposal: decision.proposal,
    canCommit: decision.canCommit,
    currentSnapshotId: snapshot.snapshotId,
  });
}

export interface ApplyPersistedProposalBatchDecisionInput {
  readonly store: RuntimeStore;
  readonly eventBus: RunEventBus;
  readonly envelope: CommandEnvelope;
  readonly runId: string;
  readonly getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity;
  readonly options: CreateApiServerOptions;
}

/**
 * Applies an `approve-batch` command: loads the referenced proposals, runs the
 * pure `approveProposalBatch` decision against one shared snapshot, then persists
 * and commits each accepted proposal through the same commit path as a single
 * approval. Items that fail eligibility are surfaced as recoverable step failures
 * without blocking the rest of the batch.
 */
export async function applyPersistedProposalBatchDecision(input: ApplyPersistedProposalBatchDecisionInput): Promise<void> {
  const { envelope } = input;
  const proposalIds = envelope.proposalIds ?? [];
  if (envelope.intent !== 'approve-batch' || proposalIds.length === 0) return;
  const snapshot = input.store.getLastKnownSnapshot(envelope.workspaceId);
  if (snapshot === undefined) {
    input.eventBus.publish({ type: 'run.step.failed', runId: input.runId, emittedAt: new Date().toISOString(), data: { reason: 'canonical snapshot not found' } });
    return;
  }
  const persistenceEnabled = process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
  const proposals: Proposal[] = [];
  for (const proposalId of proposalIds) {
    const proposal = input.store.getProposal(proposalId) ?? (persistenceEnabled ? await findProposal(proposalId) : undefined);
    if (proposal === undefined) {
      input.eventBus.publish({ type: 'run.step.failed', runId: input.runId, emittedAt: new Date().toISOString(), data: { reason: `proposal not found: ${proposalId}` } });
      continue;
    }
    proposals.push(proposal);
  }
  const reviewerResults = new Map<string, ReviewerResult>();
  const ensuredProposals: Proposal[] = [];
  for (const proposal of proposals) {
    const reviewed = await ensureModelEvidenceReview({ proposal, store: input.store, options: input.options, persistenceEnabled });
    ensuredProposals.push(reviewed.proposal);
    const review = reviewed.reviewerResult
      ?? (reviewed.proposal.latestReviewResultId === undefined ? undefined : (await loadReviewerResult(reviewed.proposal, input.options, persistenceEnabled, input.store)).reviewerResult);
    if (review !== undefined) {
      reviewerResults.set(reviewed.proposal.proposalId, review);
    }
  }
  const outcomes = approveProposalBatch({
    envelope,
    proposals: ensuredProposals,
    currentCanonicalVersion: snapshot.snapshotId,
    workspaceValidity: input.getWorkspaceValidity(envelope.workspaceId),
    reviewerResults,
    requireReviewerResult: persistenceEnabled || input.options.loadReviewerResult !== undefined,
  });
  for (const outcome of outcomes) {
    if (!outcome.accepted) {
      input.eventBus.publish({ type: 'run.step.failed', runId: input.runId, emittedAt: new Date().toISOString(), data: { reason: `proposal ${outcome.proposalId}: ${outcome.reason}` } });
      continue;
    }
    input.store.saveProposal(outcome.proposal);
    if (input.options.persistProposalDecision !== undefined) await input.options.persistProposalDecision(envelope.workspaceId, envelope.bookId, outcome.proposal);
    else if (persistenceEnabled) await persistProposal(envelope.workspaceId, envelope.bookId, outcome.proposal);
    const perProposalEnvelope = { ...envelope, intent: 'approve' as const, artifactType: outcome.proposal.artifactType, targetId: outcome.proposal.targetId };
    await commitProposalDecision({
      store: input.store,
      eventBus: input.eventBus,
      envelope: perProposalEnvelope,
      runId: input.runId,
      getWorkspaceValidity: input.getWorkspaceValidity,
      options: input.options,
      proposal: outcome.proposal,
      canCommit: outcome.canCommit,
      currentSnapshotId: snapshot.snapshotId,
    });
  }
}

interface CommitProposalDecisionInput {
  readonly store: RuntimeStore;
  readonly eventBus: RunEventBus;
  readonly envelope: CommandEnvelope;
  readonly runId: string;
  readonly getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity;
  readonly options: CreateApiServerOptions;
  readonly proposal: Proposal;
  readonly canCommit: boolean;
  readonly currentSnapshotId: string;
}

/**
 * Shared commit tail for both single and batch approval decisions: finalizes the
 * bootstrap artifact (when a bootstrap approval session owns the target), otherwise
 * commits the approved canonical draft, then updates the artifact summary and emits
 * the lifecycle event for the decision intent.
 */
async function commitProposalDecision(input: CommitProposalDecisionInput): Promise<void> {
  const { envelope, proposal } = input;
  let committed = false;
  if (input.canCommit
    && isBootstrapArtifactType(proposal.artifactType)
    && hasBootstrapApprovalSession(input.store, envelope.bookId, proposal.artifactType)) {
    const init = await finalizeBootstrapArtifactApproval({
      store: input.store,
      eventBus: input.eventBus,
      runId: input.runId,
      workspaceId: envelope.workspaceId,
      bookId: envelope.bookId,
      workspaceRoot: input.options.workspaceRoot ?? process.cwd(),
      artifactType: proposal.artifactType,
      proposal,
      options: input.options,
    });
    if (init.reason !== undefined) {
      updateArtifactDecisionStatus(input.store, envelope, proposal.status);
      input.eventBus.publish({ type: 'run.step.failed', runId: input.runId, emittedAt: new Date().toISOString(), data: { reason: init.reason } });
      return;
    }
    committed = true;
    updateArtifactDecisionStatus(input.store, envelope, proposal.status, committed);
    for (const event of init.events) {
      input.eventBus.publish(event);
    }
    return;
  }
  if (input.canCommit) {
    const reason = await commitApprovedProposalDraft(input.store, input.options, envelope.bookId, proposal, input.currentSnapshotId, input.getWorkspaceValidity(envelope.workspaceId));
    if (reason !== undefined) {
      updateArtifactDecisionStatus(input.store, envelope, proposal.status);
      const failedAt = new Date().toISOString();
      input.eventBus.publish({ type: 'run.step.failed', runId: input.runId, emittedAt: failedAt, data: { reason } });
      input.eventBus.publish({ type: 'artifact.commit-failed', runId: input.runId, emittedAt: failedAt, data: { proposalId: proposal.proposalId, status: proposal.status, reason, recoverable: true } });
      return;
    }
    committed = true;
    await reSyncWorkspaceAfterCommit(input.store, input.options, envelope.workspaceId, input.options.workspaceRoot ?? process.cwd());
  }
  updateArtifactDecisionStatus(input.store, envelope, proposal.status, committed);
  const eventType = committed ? 'artifact.canonical-committed' : proposal.status === 'waiting-sync' || proposal.status === 'commit-blocked' ? 'artifact.commit-blocked' : envelope.intent === 'reject' ? 'artifact.rejected' : envelope.intent === 'export-draft' ? 'artifact.exported' : envelope.intent === 'override-approve' ? 'artifact.override-approved' : 'artifact.approved';
  input.eventBus.publish({ type: eventType, runId: input.runId, emittedAt: new Date().toISOString(), data: { proposalId: proposal.proposalId, status: proposal.status } });
}

async function loadReviewerResult(proposal: Proposal, options: CreateApiServerOptions, persistenceEnabled: boolean, store: RuntimeStore): Promise<{ readonly reviewerResult?: ReviewerResult }> {
  if (proposal.latestReviewResultId === undefined) return {};
  const result = options.loadReviewerResult !== undefined ? await options.loadReviewerResult(proposal.latestReviewResultId) : persistenceEnabled ? await findPersistedReviewerResult(proposal.latestReviewResultId) : store.getReviewerResult(proposal.latestReviewResultId);
  return result === undefined ? {} : { reviewerResult: result };
}

interface EnsureModelEvidenceReviewInput {
  readonly proposal: Proposal;
  readonly store: RuntimeStore;
  readonly options: CreateApiServerOptions;
  readonly persistenceEnabled: boolean;
}

/**
 * Enforces the mandatory model-evidence gate for imported/generated content (RQ2/RQ3):
 * when the proposal origin requires model evidence and no real model review exists,
 * the review is run against the provider just in time for approval. Without a
 * configured provider no review can be produced, so the approval is blocked
 * (RQ6: 无 provider 一律禁止批准).
 */
async function ensureModelEvidenceReview(input: EnsureModelEvidenceReviewInput): Promise<{ readonly proposal: Proposal; readonly reviewerResult?: ReviewerResult }> {
  if (!requiresModelEvidence(input.proposal)) {
    return { proposal: input.proposal };
  }
  const existing = await loadReviewerResult(input.proposal, input.options, input.persistenceEnabled, input.store);
  if (existing.reviewerResult?.evidenceSource === 'model') {
    return { proposal: input.proposal, reviewerResult: existing.reviewerResult };
  }
  const provider = input.options.provideModel?.();
  if (provider === undefined) {
    return { proposal: input.proposal };
  }
  const loadDraft = input.options.loadCanonicalDraft ?? (input.persistenceEnabled ? findPersistedCanonicalDraft : undefined);
  const draft = input.store.getCanonicalDraft(input.proposal.proposalId) ?? await loadDraft?.(input.proposal.proposalId);
  if (draft === undefined) {
    return { proposal: input.proposal };
  }
  // Feed the Reviewer role template (agents/reviewer.agent.md) into the model call
  // so the documented role instructions (quality gates, hard-failure rules, override
  // semantics) actually shape the reviewer evidence instead of a bare prompt.
  const workspaceRoot = input.options.workspaceRoot ?? process.cwd();
  const roleTemplate = await resolveRoleTemplate(workspaceRoot, 'reviewer');
  const evidence = await requestReviewerModelEvidence(provider, input.proposal.artifactType, draft.content, roleTemplate, workspaceRoot);
  let rules = DEFAULT_REVIEWER_RULE_THRESHOLDS;
  try {
    rules = await loadReviewerRules(workspaceRoot);
  } catch {
    // Fall back to the defaults when the rules file is unavailable (e.g. unit tests).
  }
  const reviewerResult = assembleReviewerResult(draft.content, evidence, rules, 'model', false);
  const reviewResultId = `review-${input.proposal.proposalId}-model`;
  input.store.saveReviewerResult(reviewResultId, reviewerResult);
  const linked = { ...input.proposal, latestReviewResultId: reviewResultId };
  input.store.saveProposal(linked);
  return { proposal: linked, reviewerResult };
}

/**
 * Re-runs the canonical re-sync pipeline over the on-disk workspace immediately after
 * a commit, so snapshot/validity reflect the committed files without waiting for the
 * file watcher (docs/current-state/08-architecture-gap-matrix.md §2: "commit 主要依赖
 * watcher re-sync").
 */
async function reSyncWorkspaceAfterCommit(store: RuntimeStore, options: CreateApiServerOptions, workspaceId: string, workspaceRoot: string): Promise<void> {
  const readFiles = options.readCanonicalFiles ?? readCanonicalWorkspaceFiles;
  const files = await readFiles(workspaceRoot);
  const reconciled = reSyncState(files, store.getLastKnownSnapshot(workspaceId));
  store.setLastKnownSnapshot(workspaceId, reconciled.snapshot);
  store.setWorkspaceValidity(workspaceId, reconciled.validity);
}

async function commitApprovedProposalDraft(store: RuntimeStore, options: CreateApiServerOptions, bookId: string, proposal: Proposal, currentSnapshotId: string, validity: WorkspaceValidity): Promise<string | undefined> {
  const loadDraft = options.loadCanonicalDraft ?? (process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test' ? findPersistedCanonicalDraft : undefined);
  const draft = store.getCanonicalDraft(proposal.proposalId) ?? await loadDraft?.(proposal.proposalId);
  if (draft === undefined) return `canonical draft not found for proposal ${proposal.proposalId}`;
  try {
    const validated = createApprovedCanonicalDraft(draft, proposal);
    const bundled = await Promise.all((proposal.bundledDiffRefs ?? []).map(async (id) => { const item = store.getCanonicalDraft(id) ?? await loadDraft?.(id); if (item === undefined) throw new Error(`canonical bundle draft not found: ${id}`); return item; }));
    const result = await withCanonicalCommitLane(bookId, () => commitCanonicalBundle({ workspaceRoot: options.workspaceRoot ?? process.cwd(), files: [validated, ...bundled].map((item) => ({ relativePath: item.relativePath, content: item.content })), workspaceValidity: validity, proposalSnapshotId: proposal.basedOnCanonicalVersion, currentSnapshotId }));
    if (result.committed) { store.recordInternalCanonicalCommit(validated.relativePath, validated.content); for (const item of bundled) store.recordInternalCanonicalCommit(item.relativePath, item.content); }
    return result.committed ? undefined : result.reason;
  } catch (cause) { return cause instanceof Error ? cause.message : String(cause); }
}

function updateArtifactDecisionStatus(store: RuntimeStore, envelope: CommandEnvelope, status: string, committed = false): void {
  if (envelope.artifactType === undefined || envelope.targetId === undefined) return;
  const existing = store.getArtifact(envelope.artifactType, envelope.targetId);
  store.upsertArtifact({ ...existing, artifactType: envelope.artifactType, targetId: envelope.targetId, canonicalStatus: committed ? 'approved' : existing?.canonicalStatus ?? 'draft', proposalStatus: status, updatedAt: new Date().toISOString() });
}
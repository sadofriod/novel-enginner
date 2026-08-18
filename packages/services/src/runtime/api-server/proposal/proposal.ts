/* eslint-disable complexity */
import type { CommandEnvelope, Proposal, ReviewerResult } from '../../../domain';
import type { WorkspaceValidity } from '../../../domain/values';
import { findActiveProposalForTarget, findPersistedCanonicalDraft, findPersistedReviewerResult, persistProposal } from '../../../persistence/operations';
import { applyProposalCommand } from '../../../workflow/command-lifecycle';
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
  const reviewerResult = await loadReviewerResult(proposal, input.options, persistenceEnabled, input.store);
  const decision = applyProposalCommand({ envelope: input.envelope, proposal, currentCanonicalVersion: snapshot.snapshotId, workspaceValidity: input.getWorkspaceValidity(input.envelope.workspaceId), ...reviewerResult, requireReviewerResult: persistenceEnabled || input.options.loadReviewerResult !== undefined });
  if (!decision.accepted) { input.eventBus.publish({ type: 'run.step.failed', runId: input.runId, emittedAt: new Date().toISOString(), data: { reason: decision.reason } }); return; }
  // Keep the in-memory proposal in sync with the decision so the approval queue
  // (which derives artifact state from the store) reflects the real lifecycle status.
  input.store.saveProposal(decision.proposal);
  if (input.options.persistProposalDecision !== undefined) await input.options.persistProposalDecision(input.envelope.workspaceId, input.envelope.bookId, decision.proposal);
  else if (persistenceEnabled) await persistProposal(input.envelope.workspaceId, input.envelope.bookId, decision.proposal);
  else input.store.saveProposal(decision.proposal);
  let committed = false;
  if (decision.canCommit
    && isBootstrapArtifactType(input.envelope.artifactType)
    && hasBootstrapApprovalSession(input.store, input.envelope.bookId, input.envelope.artifactType)) {
    const init = await finalizeBootstrapArtifactApproval({
      store: input.store,
      eventBus: input.eventBus,
      runId: input.runId,
      workspaceId: input.envelope.workspaceId,
      bookId: input.envelope.bookId,
      workspaceRoot: input.options.workspaceRoot ?? process.cwd(),
      artifactType: input.envelope.artifactType as Proposal['artifactType'],
      proposal: decision.proposal,
      options: input.options,
    });
    if (init.reason !== undefined) {
      updateArtifactDecisionStatus(input.store, input.envelope, decision.proposal.status);
      input.eventBus.publish({ type: 'run.step.failed', runId: input.runId, emittedAt: new Date().toISOString(), data: { reason: init.reason } });
      return;
    }
    committed = true;
    updateArtifactDecisionStatus(input.store, input.envelope, decision.proposal.status, committed);
    for (const event of init.events) {
      input.eventBus.publish(event);
    }
    return;
  }
  if (decision.canCommit) {
    const reason = await commitApprovedProposalDraft(input.store, input.options, input.envelope.bookId, decision.proposal, snapshot.snapshotId, input.getWorkspaceValidity(input.envelope.workspaceId));
    if (reason !== undefined) {
      updateArtifactDecisionStatus(input.store, input.envelope, decision.proposal.status);
      const failedAt = new Date().toISOString();
      input.eventBus.publish({ type: 'run.step.failed', runId: input.runId, emittedAt: failedAt, data: { reason } });
      input.eventBus.publish({ type: 'artifact.commit-failed', runId: input.runId, emittedAt: failedAt, data: { proposalId: decision.proposal.proposalId, status: decision.proposal.status, reason, recoverable: true } });
      return;
    }
    committed = true;
    await reSyncWorkspaceAfterCommit(input.store, input.options, input.envelope.workspaceId, input.options.workspaceRoot ?? process.cwd());
  }
  updateArtifactDecisionStatus(input.store, input.envelope, decision.proposal.status, committed);
  const eventType = committed ? 'artifact.canonical-committed' : decision.proposal.status === 'waiting-sync' || decision.proposal.status === 'commit-blocked' ? 'artifact.commit-blocked' : input.envelope.intent === 'reject' ? 'artifact.rejected' : input.envelope.intent === 'export-draft' ? 'artifact.exported' : input.envelope.intent === 'override-approve' ? 'artifact.override-approved' : 'artifact.approved';
  input.eventBus.publish({ type: eventType, runId: input.runId, emittedAt: new Date().toISOString(), data: { proposalId: decision.proposal.proposalId, status: decision.proposal.status } });
}

async function loadReviewerResult(proposal: Proposal, options: CreateApiServerOptions, persistenceEnabled: boolean, store: RuntimeStore): Promise<{ readonly reviewerResult?: ReviewerResult }> {
  if (proposal.latestReviewResultId === undefined) return {};
  const result = options.loadReviewerResult !== undefined ? await options.loadReviewerResult(proposal.latestReviewResultId) : persistenceEnabled ? await findPersistedReviewerResult(proposal.latestReviewResultId) : store.getReviewerResult(proposal.latestReviewResultId);
  return result === undefined ? {} : { reviewerResult: result };
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
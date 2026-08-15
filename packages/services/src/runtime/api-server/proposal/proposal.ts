/* eslint-disable complexity */
import type { CommandEnvelope, Proposal, ReviewerResult } from '../../../domain';
import type { WorkspaceValidity } from '../../../domain/values';
import { findActiveProposalForTarget, findPersistedCanonicalDraft, findPersistedReviewerResult, persistProposal } from '../../../persistence/operations';
import { applyProposalCommand } from '../../../workflow/command-lifecycle';
import { commitCanonicalBundle } from '../../../workspace/canonical-commit';
import { withCanonicalCommitLane } from '../../../workspace/canonical-commit-lane';
import { createApprovedCanonicalDraft } from '../../canonical-draft';
import type { CommandResult, } from '../../command-handler';
import { RunEventBus } from '../../event-bus';
import { RuntimeStore } from '../../store';
import type { CreateApiServerOptions } from '../types';

export function resolveProposalStatus(intent: CommandEnvelope['intent'], validity: WorkspaceValidity): string {
  if (intent === 'approve' || intent === 'override-approve') return validity === 'dirty' ? 'waiting-sync' : validity === 'invalid' ? 'commit-blocked' : intent === 'approve' ? 'approved' : 'override-approved';
  if (intent === 'reject') return 'rejected';
  if (intent === 'export-draft') return 'exported';
  return 'pending-approval';
}

export function syncArtifactSummary(store: RuntimeStore, _eventBus: RunEventBus, envelope: CommandEnvelope, result: CommandResult, getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity): void {
  if (result.status !== 'accepted' || envelope.artifactType === undefined || envelope.targetId === undefined) return;
  const existing = store.getArtifact(envelope.artifactType, envelope.targetId);
  const proposalIntent = envelope.intent === 'propose' || envelope.intent === 'regenerate';
  const decisionIntent = ['approve', 'override-approve', 'reject', 'export-draft'].includes(envelope.intent);
  store.upsertArtifact({ ...existing, artifactType: envelope.artifactType, targetId: envelope.targetId, canonicalStatus: existing?.canonicalStatus ?? 'draft', ...(proposalIntent ? { activeProposalId: existing?.activeProposalId ?? `proposal-${result.runId}`, proposalStatus: 'pending-approval' } : decisionIntent ? {} : { proposalStatus: resolveProposalStatus(envelope.intent, getWorkspaceValidity(envelope.workspaceId)) }), updatedAt: result.acceptedAt });
}

export function handleInlineEdit(store: RuntimeStore, artifactType: string, targetId: string, inlineEditNote: string): void {
  const artifact = store.getArtifact(artifactType, targetId);
  if (artifact !== undefined) store.upsertArtifact({ ...artifact, inlineEditNote, reviewStale: true, updatedAt: new Date().toISOString() });
}

export async function applyPersistedProposalDecision(input: { readonly store: RuntimeStore; readonly eventBus: RunEventBus; readonly envelope: CommandEnvelope; readonly runId: string; readonly getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity; readonly options: CreateApiServerOptions }): Promise<void> {
  if (!['approve', 'reject', 'override-approve', 'export-draft'].includes(input.envelope.intent) || input.envelope.artifactType === undefined || input.envelope.targetId === undefined) return;
  const persistenceEnabled = process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
  const proposal = input.options.loadActiveProposal !== undefined ? await input.options.loadActiveProposal(input.envelope.workspaceId, input.envelope.bookId, input.envelope.artifactType, input.envelope.targetId) : persistenceEnabled ? await findActiveProposalForTarget(input.envelope.workspaceId, input.envelope.bookId, input.envelope.artifactType, input.envelope.targetId) : input.store.getActiveProposal(input.envelope.artifactType, input.envelope.targetId);
  const snapshot = input.store.getLastKnownSnapshot(input.envelope.workspaceId);
  if (proposal === undefined || snapshot === undefined) { input.eventBus.publish({ type: 'run.step.failed', runId: input.runId, emittedAt: new Date().toISOString(), data: { reason: proposal === undefined ? 'active proposal not found' : 'canonical snapshot not found' } }); return; }
  const reviewerResult = await loadReviewerResult(proposal, input.options, persistenceEnabled);
  const decision = applyProposalCommand({ envelope: input.envelope, proposal, currentCanonicalVersion: snapshot.snapshotId, workspaceValidity: input.getWorkspaceValidity(input.envelope.workspaceId), ...reviewerResult, requireReviewerResult: persistenceEnabled || input.options.loadReviewerResult !== undefined });
  if (!decision.accepted) { input.eventBus.publish({ type: 'run.step.failed', runId: input.runId, emittedAt: new Date().toISOString(), data: { reason: decision.reason } }); return; }
  if (input.options.persistProposalDecision !== undefined) await input.options.persistProposalDecision(input.envelope.workspaceId, input.envelope.bookId, decision.proposal);
  else if (persistenceEnabled) await persistProposal(input.envelope.workspaceId, input.envelope.bookId, decision.proposal);
  else input.store.saveProposal(decision.proposal);
  let committed = false;
  if (decision.canCommit) { const reason = await commitApprovedProposalDraft(input.store, input.options, input.envelope.bookId, decision.proposal, snapshot.snapshotId, input.getWorkspaceValidity(input.envelope.workspaceId)); if (reason !== undefined) { updateArtifactDecisionStatus(input.store, input.envelope, decision.proposal.status); input.eventBus.publish({ type: 'run.step.failed', runId: input.runId, emittedAt: new Date().toISOString(), data: { reason } }); return; } committed = true; }
  updateArtifactDecisionStatus(input.store, input.envelope, decision.proposal.status, committed);
  const eventType = committed ? 'artifact.canonical-committed' : decision.proposal.status === 'waiting-sync' || decision.proposal.status === 'commit-blocked' ? 'artifact.commit-blocked' : input.envelope.intent === 'reject' ? 'artifact.rejected' : input.envelope.intent === 'export-draft' ? 'artifact.exported' : input.envelope.intent === 'override-approve' ? 'artifact.override-approved' : 'artifact.approved';
  input.eventBus.publish({ type: eventType, runId: input.runId, emittedAt: new Date().toISOString(), data: { proposalId: decision.proposal.proposalId, status: decision.proposal.status } });
}

async function loadReviewerResult(proposal: Proposal, options: CreateApiServerOptions, persistenceEnabled: boolean): Promise<{ readonly reviewerResult?: ReviewerResult }> {
  if (proposal.latestReviewResultId === undefined) return {};
  const result = options.loadReviewerResult !== undefined ? await options.loadReviewerResult(proposal.latestReviewResultId) : persistenceEnabled ? await findPersistedReviewerResult(proposal.latestReviewResultId) : undefined;
  return result === undefined ? {} : { reviewerResult: result };
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
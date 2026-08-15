/* eslint-disable complexity */

import type { CommandEnvelope, Proposal } from '../domain';
import type { WorkspaceValidity } from '../domain/values';

import { resolveArtifactWorkflow } from './artifact-workflows';

export type ProposalCommandLifecycleResult =
  | { readonly accepted: true; readonly proposal: Proposal; readonly canCommit: boolean }
  | { readonly accepted: false; readonly reason: string };

export function applyProposalCommand(input: {
  readonly envelope: CommandEnvelope;
  readonly proposal: Proposal;
  readonly currentCanonicalVersion: string;
  readonly workspaceValidity: WorkspaceValidity;
}): ProposalCommandLifecycleResult {
  const { envelope, proposal } = input;
  const mismatch = validateProposalTarget(envelope, proposal);
  if (mismatch !== undefined) {
    return mismatch;
  }

  const workflow = resolveArtifactWorkflow(proposal.artifactType);
  if (workflow === undefined) {
    return { accepted: false, reason: `workflow is not registered for ${proposal.artifactType}` };
  }

  const directDecision = resolveDirectDecision(envelope, workflow, proposal);
  if (directDecision !== undefined) {
    return directDecision;
  }

  const retry = resolveCommitRetry(envelope, proposal, workflow, input);
  if (retry !== undefined) {
    return retry;
  }

  const approval = workflow.approve(
    proposal,
    input.currentCanonicalVersion,
    envelope.intent === 'override-approve',
    envelope.intent === 'override-approve' ? `override-${proposal.proposalId}` : undefined,
  );
  if (!approval.accepted) {
    return { accepted: false, reason: approval.message };
  }

  const commit = workflow.commit(approval.proposal, input.workspaceValidity);
  return { accepted: true, proposal: commit.proposal, canCommit: commit.canCommit };
}

function resolveCommitRetry(
  envelope: CommandEnvelope,
  proposal: Proposal,
  workflow: NonNullable<ReturnType<typeof resolveArtifactWorkflow>>,
  input: {
    readonly currentCanonicalVersion: string;
    readonly workspaceValidity: WorkspaceValidity;
  },
): ProposalCommandLifecycleResult | undefined {
  const recoveredProposal = workflow.recoverFromBlocked(proposal, input.workspaceValidity);
  const isBlocked = proposal.status === 'commit-blocked' || proposal.status === 'waiting-sync';
  if (isBlocked && recoveredProposal.status === proposal.status) {
    return { accepted: true, proposal: recoveredProposal, canCommit: false };
  }

  const matchesApprovedIntent = envelope.intent === 'approve' && recoveredProposal.status === 'approved';
  const matchesOverrideIntent = envelope.intent === 'override-approve' && recoveredProposal.status === 'override-approved';
  if (!matchesApprovedIntent && !matchesOverrideIntent) {
    return undefined;
  }
  if (recoveredProposal.basedOnCanonicalVersion !== input.currentCanonicalVersion) {
    return { accepted: false, reason: 'proposal snapshot is stale; regenerate before committing' };
  }

  const commit = workflow.commit(recoveredProposal, input.workspaceValidity);
  return { accepted: true, proposal: commit.proposal, canCommit: commit.canCommit };
}

function validateProposalTarget(
  envelope: CommandEnvelope,
  proposal: Proposal,
): ProposalCommandLifecycleResult | undefined {
  if (envelope.artifactType !== proposal.artifactType || envelope.targetId !== proposal.targetId) {
    return { accepted: false, reason: 'command target does not match proposal target' };
  }
  return undefined;
}

function resolveDirectDecision(
  envelope: CommandEnvelope,
  workflow: NonNullable<ReturnType<typeof resolveArtifactWorkflow>>,
  proposal: Proposal,
): ProposalCommandLifecycleResult | undefined {
  if (envelope.intent === 'reject') {
    return { accepted: true, proposal: workflow.reject(proposal), canCommit: false };
  }
  if (envelope.intent === 'export-draft') {
    return { accepted: true, proposal: workflow.exportDraft(proposal), canCommit: false };
  }
  if (envelope.intent !== 'approve' && envelope.intent !== 'override-approve') {
    return { accepted: false, reason: `intent ${envelope.intent} is not a proposal decision` };
  }
  return undefined;
}
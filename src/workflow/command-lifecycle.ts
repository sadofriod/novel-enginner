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
  if (envelope.artifactType !== proposal.artifactType || envelope.targetId !== proposal.targetId) {
    return { accepted: false, reason: 'command target does not match proposal target' };
  }

  const workflow = resolveArtifactWorkflow(proposal.artifactType);
  if (workflow === undefined) {
    return { accepted: false, reason: `workflow is not registered for ${proposal.artifactType}` };
  }

  if (envelope.intent === 'reject') {
    return { accepted: true, proposal: workflow.reject(proposal), canCommit: false };
  }
  if (envelope.intent === 'export-draft') {
    return { accepted: true, proposal: workflow.exportDraft(proposal), canCommit: false };
  }
  if (envelope.intent !== 'approve' && envelope.intent !== 'override-approve') {
    return { accepted: false, reason: `intent ${envelope.intent} is not a proposal decision` };
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
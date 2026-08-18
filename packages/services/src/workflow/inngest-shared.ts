/**
 * Shared helpers for the Inngest workflow functions: proposal creation and
 * canonical workspace re-sync. In a real deployment these adapt to a
 * Prisma-backed registry; here they use the process-local persistence layer.
 */
import { NonRetriableError } from 'inngest';

import { findProposal, listActiveProposalsForBook, persistProposal } from '../persistence/operations';
import { type Proposal } from '../domain/schema';
import { readCanonicalWorkspaceFiles } from '../workspace/file-watcher';

import { resolveArtifactWorkflow } from './artifact-workflows';
import { buildProposalRegistry } from './proposal-lifecycle';

export async function createPersistedProposal(input: {
  readonly workspaceId: string;
  readonly bookId: string;
  readonly artifactType: Proposal['artifactType'];
  readonly targetId: string;
  readonly intent: Proposal['intent'];
  readonly parentRunId: string;
  readonly canonicalVersion?: string;
}) {
  if (input.canonicalVersion === undefined) {
    throw new NonRetriableError(
      `Cannot create ${input.artifactType}/${input.targetId} proposal without canonicalVersion.`,
    );
  }

  const proposalId = `proposal-${input.parentRunId}`;
  const existingProposal = await findProposal(proposalId);
  if (existingProposal !== undefined) {
    return { created: existingProposal };
  }

  const activeProposals = await listActiveProposalsForBook(input.workspaceId, input.bookId);
  const workflow = resolveArtifactWorkflow(input.artifactType);
  if (workflow === undefined) {
    throw new NonRetriableError(`${input.artifactType} workflow not registered`);
  }

  const proposal: Proposal = {
    proposalId,
    artifactType: input.artifactType,
    targetId: input.targetId,
    status: 'pending-review',
    intent: input.intent,
    origin: 'generated',
    basedOnCanonicalVersion: input.canonicalVersion,
    parentRunId: input.parentRunId,
  };
  const result = workflow.propose({ proposal, registry: buildProposalRegistry(activeProposals) });
  await persistProposal(input.workspaceId, input.bookId, result.created);
  if (result.superseded !== undefined) {
    await persistProposal(input.workspaceId, input.bookId, result.superseded);
  }
  return result;
}

export async function synchronizeWorkflowWorkspace(input: {
  readonly workspaceId: string;
  readonly bookId: string;
  readonly requestedBy: string;
  readonly runId: string;
}): Promise<string> {
  const workspaceRoot = process.env['NOVEL_WORKSPACE_ROOT'] ?? process.cwd();
  const files = await readCanonicalWorkspaceFiles(workspaceRoot);
  const response = await fetch(
    `${process.env['NOVEL_API_BASE_URL'] ?? 'http://localhost:3000'}/sync/re-sync-state`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId: input.workspaceId,
        bookId: input.bookId,
        files,
        requestedBy: input.requestedBy,
        approvalMode: 'manual',
        idempotencyKey: `workflow-sync-${input.runId}`,
      }),
    },
  );
  if (!response.ok) {
    throw new NonRetriableError(`re-sync-state failed: ${response.status}`);
  }
  const body = await response.json() as { canonicalVersion?: unknown };
  if (typeof body.canonicalVersion !== 'string') {
    throw new NonRetriableError('re-sync-state did not return a canonical version.');
  }
  return body.canonicalVersion;
}

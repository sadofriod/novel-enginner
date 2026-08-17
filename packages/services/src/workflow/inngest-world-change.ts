/**
 * world-change workflow
 * (docs/architecture/modules/04-workflows-and-agents.md §4.2)
 */
import { createDefaultModelProvider } from '../agent/provider';
import { assembleReviewerResult } from '../agent/reviewer';
import { requestReviewerModelEvidence } from '../agent/reviewer-agent';
import { loadReviewerRules } from '../agent/reviewer-rules-loader';
import { generateWorldState } from '../agent/world-builder';

import { inngest } from './inngest-client';
import { createPersistedProposal, synchronizeWorkflowWorkspace } from './inngest-shared';

export const worldChangeFunction = inngest.createFunction(
  {
    id: 'world-change-workflow',
    name: 'World Change Workflow',
    concurrency: { limit: 1, key: 'event.data.bookId' },
    retries: 2,
  },
  { event: 'novel/world-change.requested' },
  async ({ event, step }) => {
    const { workspaceId, bookId, targetId, intent, runId } = event.data;
    const canonicalVersion = await step.run(
      're-sync-state',
      async () => synchronizeWorkflowWorkspace({ workspaceId, bookId, requestedBy: event.data.requestedBy, runId }),
    );

    const proposalResult = await step.run('create-proposal', async () => {
      return createPersistedProposal({
        workspaceId,
        bookId,
        artifactType: 'world-change',
        targetId,
        intent,
        parentRunId: runId,
        canonicalVersion,
      });
    });

    const worldChange = await step.run('world-builder-analysis', async () => {
      return generateWorldState({
        artifactType: 'world-change',
        targetId,
        canonicalContext: `workspace=${workspaceId}; book=${bookId}`,
        instructions: 'Analyze the requested world change, affected entities, constraints, and a minimal patch set.',
      }, createDefaultModelProvider());
    });

    const review = await step.run('reviewer-check', async () => {
      return assembleReviewerResult(
        worldChange.text,
        await requestReviewerModelEvidence(createDefaultModelProvider(), 'world-change', worldChange.text),
        await loadReviewerRules(process.env['NOVEL_WORKSPACE_ROOT'] ?? process.cwd()),
      );
    });

    return {
      proposalId: proposalResult.created.proposalId,
      status: proposalResult.created.status,
      workspaceId,
      bookId,
      targetId,
      generatedText: worldChange.text,
      reviewApproved: review.approved,
    };
  },
);

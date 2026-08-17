/**
 * volume-outline workflow
 * (docs/architecture/modules/04-workflows-and-agents.md §4.2)
 */
import { outlineChapter } from '../agent/plot-planner';
import { createDefaultModelProvider } from '../agent/provider';
import { persistCanonicalDraft } from '../persistence/operations';
import { createVolumeOutlineDraft } from '../runtime/canonical-draft';

import { inngest } from './inngest-client';
import { createPersistedProposal, synchronizeWorkflowWorkspace } from './inngest-shared';

export const volumeOutlineFunction = inngest.createFunction(
  {
    id: 'volume-outline-workflow',
    name: 'Volume Outline Workflow',
    concurrency: { limit: 1, key: 'event.data.bookId' },
    retries: 2,
  },
  { event: 'novel/volume-outline.requested' },
  async ({ event, step }) => {
    const { workspaceId, bookId, targetId, intent, runId } = event.data;

    const canonicalVersion = await step.run(
      're-sync-state',
      async () => synchronizeWorkflowWorkspace({ workspaceId, bookId, requestedBy: event.data.requestedBy, runId }),
    );

    const volumeOutline = await step.run('plot-planner-volume', async () => {
      return outlineChapter({
        artifactType: 'volume-outline',
        targetId,
        canonicalContext: `workspace=${workspaceId}; book=${bookId}`,
        instructions: `Return only complete canonical Markdown for state/volumes/${targetId}.md. Include every required Volume frontmatter field and use the target id exactly.`,
      }, createDefaultModelProvider());
    });

    const draft = await step.run('validate-canonical-draft', async () => createVolumeOutlineDraft({
      proposalId: `proposal-${runId}`,
      targetId,
      content: volumeOutline.text,
    }));

    const proposalResult = await step.run('create-proposal', async () => {
      return createPersistedProposal({
        workspaceId,
        bookId,
        artifactType: 'volume-outline',
        targetId,
        intent,
        parentRunId: runId,
        canonicalVersion,
      });
    });

    await step.run('persist-canonical-draft', async () => {
      await persistCanonicalDraft({ draft, proposal: proposalResult.created });
    });

    return {
      proposalId: proposalResult.created.proposalId,
      status: proposalResult.created.status,
      workspaceId,
      bookId,
      targetId,
      generatedText: volumeOutline.text,
    };
  },
);

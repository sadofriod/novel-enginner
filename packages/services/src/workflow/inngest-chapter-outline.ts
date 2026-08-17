/**
 * chapter-outline workflow
 * (docs/architecture/modules/04-workflows-and-agents.md §4.2)
 */
import { validateCharacterActions } from '../agent/actor';
import { outlineChapter } from '../agent/plot-planner';
import { createDefaultModelProvider } from '../agent/provider';
import { generateWorldState } from '../agent/world-builder';
import { persistCanonicalDraft } from '../persistence/operations';
import { createChapterOutlineDraft } from '../runtime/canonical-draft';

import { inngest } from './inngest-client';
import { createPersistedProposal, synchronizeWorkflowWorkspace } from './inngest-shared';

export const chapterOutlineFunction = inngest.createFunction(
  {
    id: 'chapter-outline-workflow',
    name: 'Chapter Outline Workflow',
    concurrency: { limit: 1, key: 'event.data.bookId' },
    retries: 2,
  },
  { event: 'novel/chapter-outline.requested' },
  async ({ event, step }) => {
    const { workspaceId, bookId, targetId, intent, runId } = event.data;

    // Step 1: re-sync canonical state before any workflow work.
    const canonicalVersion = await step.run(
      're-sync-state',
      async () => synchronizeWorkflowWorkspace({ workspaceId, bookId, requestedBy: event.data.requestedBy, runId }),
    );

    // Step 3: WorldBuilder/PlotPlanner sub-steps (agent calls) — skeletons.
    const provider = createDefaultModelProvider();
    const worldState = await step.run('world-builder-sync', async () => {
      return generateWorldState({
        artifactType: 'chapter-outline',
        targetId,
        canonicalContext: `workspace=${workspaceId}; book=${bookId}`,
        instructions: 'Identify world constraints and facts that the chapter outline must respect.',
      }, provider);
    });

    const chapterOutline = await step.run('plot-planner-outline', async () => {
      return outlineChapter({
        artifactType: 'chapter-outline',
        targetId,
        canonicalContext: worldState.text,
        instructions: `Return only complete canonical Markdown for state/chapters/${targetId}.md. Include every required ChapterOutline frontmatter field and use the target id exactly.`,
      }, provider);
    });

    const draft = await step.run('validate-canonical-draft', async () => createChapterOutlineDraft({
      proposalId: `proposal-${runId}`,
      targetId,
      content: chapterOutline.text,
    }));

    const proposalResult = await step.run('create-proposal', async () => {
      return createPersistedProposal({
        workspaceId,
        bookId,
        artifactType: 'chapter-outline',
        targetId,
        intent,
        parentRunId: runId,
        canonicalVersion,
      });
    });

    await step.run('persist-canonical-draft', async () => {
      await persistCanonicalDraft({ draft, proposal: proposalResult.created });
    });

    const actorValidation = await step.run('actor-validate', async () => {
      return validateCharacterActions({
        artifactType: 'chapter-outline',
        targetId,
        canonicalContext: chapterOutline.text,
        instructions: 'Validate every character action against motivation, knowledge, and constraints. Report blockers.',
      }, provider);
    });

    // Step 4: emit artifact.proposed — callers subscribe via SSE.
    return {
      proposalId: proposalResult.created.proposalId,
      status: proposalResult.created.status,
      workspaceId,
      bookId,
      targetId,
      generatedText: chapterOutline.text,
      worldState: worldState.text,
      actorValidation: actorValidation.text,
    };
  },
);

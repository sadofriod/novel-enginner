/* eslint-disable complexity, max-lines-per-function */

/**
 * Inngest function definitions for the novel-enginner workflow pipeline, per
 * docs/architecture/modules/04-workflows-and-agents.md §4.1-§4.2 and
 * docs/architecture/modules/10-v1-execution-plan.md Phase 6.
 *
 * Each function is a thin, durable Inngest step-function adapter over the pure
 * workflow skeletons in `./artifact-workflows`. The skeletons define which
 * domain decisions to call in which order; Inngest provides the retryability,
 * concurrency control, and step checkpointing.
 *
 * Inngest event names match docs §7.7 exactly:
 *   novel/chapter-outline.requested
 *   novel/chapter-manuscript.requested
 *   novel/volume-outline.requested
 *   novel/world-change.requested
 *   novel/sync.rebuild-graph
 *   novel/sync.reindex-state
 *   novel/review.synthetic-requested
 */
import { NonRetriableError } from 'inngest';

import { validateCharacterActions } from '../agent/actor';
import { generateManuscript } from '../agent/drafter';
import { outlineChapter } from '../agent/plot-planner';
import { createDefaultModelProvider } from '../agent/provider';
import { generateWorldState } from '../agent/world-builder';
import { assembleReviewerResult } from '../agent/reviewer';
import { requestReviewerModelEvidence } from '../agent/reviewer-agent';
import { loadReviewerRules } from '../agent/reviewer-rules-loader';
import {
  persistCanonicalDraft,
  persistProposal,
  persistReviewerResultAndLinkProposal,
} from '../persistence/operations';
import { type ReviewerResult } from '../domain/schema';
import {
  createChapterManuscriptDraft,
  createChapterOutlineDraft,
  createVolumeOutlineDraft,
} from '../runtime/canonical-draft';
import { inngest } from './inngest-client';
import { projectBriefFunction, storyBlueprintFunction, worldFoundationFunction } from './inngest-foundation-functions';
import { rebuildGraphFunction, syntheticReviewFunction } from './inngest-review-functions';
import { createPersistedProposal, synchronizeWorkflowWorkspace } from './inngest-workflow-helpers';

// ---------------------------------------------------------------------------
// chapter-outline workflow
// (docs/architecture/modules/04-workflows-and-agents.md §4.2)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// chapter-manuscript workflow
// (docs/architecture/modules/04-workflows-and-agents.md §4.2)
// ---------------------------------------------------------------------------

export const chapterManuscriptFunction = inngest.createFunction(
  {
    id: 'chapter-manuscript-workflow',
    name: 'Chapter Manuscript Workflow',
    concurrency: { limit: 1, key: 'event.data.bookId' },
    retries: 2,
  },
  { event: 'novel/chapter-manuscript.requested' },
  async ({ event, step }) => {
    const { workspaceId, bookId, targetId, intent, runId } = event.data;
    const canonicalVersion = await step.run(
      're-sync-state',
      async () => synchronizeWorkflowWorkspace({ workspaceId, bookId, requestedBy: event.data.requestedBy, runId }),
    );

    // Step 1: Verify the target outline is approved.
    const outlineCheck = await step.run('check-outline-approved', async () => {
      const outlineId = targetId.replace(/-manuscript$/, '-outline');
      const response = await fetch(
        `${process.env['NOVEL_API_BASE_URL'] ?? 'http://localhost:3000'}/artifacts/chapter-outline/${outlineId}`,
      );
      if (!response.ok) {
        return { blocked: true, reason: `chapter-outline ${outlineId} not found` };
      }
      const artifact = (await response.json()) as { proposalStatus?: string; canonicalStatus?: string };
      if (artifact.proposalStatus === 'pending-review' || artifact.proposalStatus === 'pending-approval') {
        return { blocked: true, reason: `chapter-outline ${outlineId} is still ${artifact.proposalStatus}` };
      }
      if (artifact.canonicalStatus !== 'approved') {
        return { blocked: true, reason: `chapter-outline ${outlineId} is not canonical-approved` };
      }
      return { blocked: false as const };
    });

    if (outlineCheck.blocked) {
      return { blocked: true, reason: outlineCheck.reason, workspaceId, bookId, targetId };
    }

    // Step 2: Create the manuscript proposal.
    const proposalResult = await step.run('create-proposal', async () => {
      return createPersistedProposal({
        workspaceId,
        bookId,
        artifactType: 'chapter-manuscript',
        targetId,
        intent,
        parentRunId: runId,
        canonicalVersion,
      });
    });

    const provider = createDefaultModelProvider();
    let draft = await step.run('drafter-generate', async () => {
      return generateManuscript({
        artifactType: 'chapter-manuscript',
        targetId,
        canonicalContext: `approved outline target: ${targetId}`,
        instructions: `Return only complete canonical Markdown for the manuscript target ${targetId}. Preserve scene anchors and do not invent canon.`,
      }, provider);
    });

    // Step 4: Reviewer assesses the manuscript — up to 2 rounds.
    let finalReview: ReviewerResult | undefined;
    for (let round = 1; round <= 2; round += 1) {
      const review = await step.run(`reviewer-round-${round}`, async () => {
        const result = assembleReviewerResult(
          draft.text,
          await requestReviewerModelEvidence(provider, 'chapter-manuscript', draft.text),
          await loadReviewerRules(process.env['NOVEL_WORKSPACE_ROOT'] ?? process.cwd()),
        );
        return result;
      });

      finalReview = review;

      if (review.approved) {
        break;
      }

      if (round < 2) {
        draft = await step.run(`drafter-rewrite-${round}`, async () => {
          return generateManuscript({
            artifactType: 'chapter-manuscript',
            targetId,
            canonicalContext: draft.text,
            instructions: 'Rewrite the draft to address reviewer failures while preserving approved plot facts.',
          }, provider);
        });
      }
    }

    await step.run('persist-reviewer-result', async () => {
      if (finalReview === undefined) {
        throw new NonRetriableError('Manuscript workflow completed without reviewer evidence.');
      }
      await persistReviewerResultAndLinkProposal(
        `review-${proposalResult.created.proposalId}`,
        proposalResult.created.proposalId,
        finalReview,
      );
    });

    if (finalReview === undefined || !finalReview.approved) {
      await step.run('mark-review-blocked', async () => {
        await persistProposal(workspaceId, bookId, {
          ...proposalResult.created,
          status: 'review-blocked',
        });
      });
      return {
        blocked: true,
        reason: 'chapter-manuscript reviewer failed after the maximum rewrite rounds',
        proposalId: proposalResult.created.proposalId,
        workspaceId,
        bookId,
        targetId,
      };
    }

    await step.run('persist-canonical-draft', async () => {
      const draftPayload = createChapterManuscriptDraft({
        proposalId: proposalResult.created.proposalId,
        targetId,
        content: draft.text,
      });
      await persistCanonicalDraft({ draft: draftPayload, proposal: proposalResult.created });
    });

    return {
      proposalId: proposalResult.created.proposalId,
      status: proposalResult.created.status,
      workspaceId,
      bookId,
      targetId,
      generatedText: draft.text,
    };
  },
);

// ---------------------------------------------------------------------------
// volume-outline workflow
// (docs/architecture/modules/04-workflows-and-agents.md §4.2)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// world-change workflow
// (docs/architecture/modules/04-workflows-and-agents.md §4.2)
// ---------------------------------------------------------------------------

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

export const inngestFunctions = [projectBriefFunction, worldFoundationFunction, storyBlueprintFunction, chapterOutlineFunction, chapterManuscriptFunction, volumeOutlineFunction, worldChangeFunction, syntheticReviewFunction, rebuildGraphFunction] as const;

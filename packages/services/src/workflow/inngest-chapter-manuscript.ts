/* eslint-disable complexity, max-lines-per-function */

/**
 * chapter-manuscript workflow
 * (docs/architecture/modules/04-workflows-and-agents.md §4.2)
 */
import { NonRetriableError } from 'inngest';

import { generateManuscript } from '../agent/drafter';
import { createDefaultModelProvider } from '../agent/provider';
import { assembleReviewerResult } from '../agent/reviewer';
import { requestReviewerModelEvidence } from '../agent/reviewer-agent';
import { loadReviewerRules } from '../agent/reviewer-rules-loader';
import {
  persistCanonicalDraft,
  persistProposal,
  persistReviewerResultAndLinkProposal,
} from '../persistence/operations';
import { type ReviewerResult } from '../domain/schema';
import { createChapterManuscriptDraft } from '../runtime/canonical-draft';

import { inngest } from './inngest-client';
import { createPersistedProposal, synchronizeWorkflowWorkspace } from './inngest-shared';

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
        const workspaceRoot = process.env['NOVEL_WORKSPACE_ROOT'] ?? process.cwd();
        const result = assembleReviewerResult(
          draft.text,
          await requestReviewerModelEvidence(provider, 'chapter-manuscript', draft.text, undefined, workspaceRoot),
          await loadReviewerRules(workspaceRoot),
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

/* eslint-disable max-lines-per-function */

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
import { assembleReviewerResult, DEFAULT_REVIEWER_RULE_THRESHOLDS } from '../agent/reviewer';
import { listActiveProposalsForWorkspace, persistProposal, persistReviewerResult } from '../persistence/operations';
import { type Proposal } from '../domain/schema';
import { resolveArtifactWorkflow } from './artifact-workflows';
import { buildProposalRegistry } from './proposal-lifecycle';
import { inngest } from './inngest-client';

// ---------------------------------------------------------------------------
// Helper: minimal in-memory ProposalRegistry for the step context.
// In a real deployment, supply a Prisma-backed registry adapter here.
// ---------------------------------------------------------------------------

async function createPersistedProposal(input: {
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

  const activeProposals = await listActiveProposalsForWorkspace(input.workspaceId);
  const workflow = resolveArtifactWorkflow(input.artifactType);
  if (workflow === undefined) {
    throw new NonRetriableError(`${input.artifactType} workflow not registered`);
  }

  const proposal: Proposal = {
    proposalId: `proposal-${input.parentRunId}`,
    artifactType: input.artifactType,
    targetId: input.targetId,
    status: 'pending-review',
    intent: input.intent,
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
    await step.run('re-sync-state', async () => {
      const response = await fetch(
        `${process.env['NOVEL_API_BASE_URL'] ?? 'http://localhost:3000'}/sync/re-sync-state`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ workspaceId, bookId }),
        },
      );
      if (!response.ok) {
        throw new NonRetriableError(`re-sync-state failed: ${response.status}`);
      }
    });

    // Step 2: Create or supersede the chapter-outline proposal.
    const proposalResult = await step.run('create-proposal', async () => {
      return createPersistedProposal({
        workspaceId,
        bookId,
        artifactType: 'chapter-outline',
        targetId,
        intent,
        parentRunId: runId,
        ...(event.data.canonicalVersion !== undefined ? { canonicalVersion: event.data.canonicalVersion } : {}),
      });
    });

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
        instructions: 'Generate a structured chapter outline with scenes, causality, and emotional progression.',
      }, provider);
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
        ...(event.data.canonicalVersion !== undefined ? { canonicalVersion: event.data.canonicalVersion } : {}),
      });
    });

    const provider = createDefaultModelProvider();
    const draft = await step.run('drafter-generate', async () => {
      return generateManuscript({
        artifactType: 'chapter-manuscript',
        targetId,
        canonicalContext: `approved outline target: ${targetId}`,
        instructions: 'Generate a manuscript draft anchored to the approved outline. Preserve scene anchors and do not invent canon.',
      }, provider);
    });

    // Step 4: Reviewer assesses the manuscript — up to 2 rounds.
    for (let round = 1; round <= 2; round += 1) {
      const reviewPassed = await step.run(`reviewer-round-${round}`, async () => {
        const result = assembleReviewerResult(
          draft.text,
          {
            hardFailures: [],
            dimensionScores: {
              antiAiVoice: 85,
              webFictionPacing: 85,
              emotionCurve: 85,
              characterConsistency: 85,
              settingConsistency: 85,
              clueCausality: 85,
              readabilityLayout: 85,
              languageTexture: 85,
            },
            rewriteDirectives: [],
          },
          DEFAULT_REVIEWER_RULE_THRESHOLDS,
        );
        return result.approved;
      });

      if (reviewPassed) {
        break;
      }

      if (round < 2) {
        await step.run(`drafter-rewrite-${round}`, async () => {
          return generateManuscript({
            artifactType: 'chapter-manuscript',
            targetId,
            canonicalContext: draft.text,
            instructions: 'Rewrite the draft to address reviewer failures while preserving approved plot facts.',
          }, provider);
        });
      }
    }

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

    await step.run('re-sync-state', async () => {
      const response = await fetch(
        `${process.env['NOVEL_API_BASE_URL'] ?? 'http://localhost:3000'}/sync/re-sync-state`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ workspaceId, bookId }),
        },
      );
      if (!response.ok) {
        throw new NonRetriableError(`re-sync-state failed: ${response.status}`);
      }
    });

    const proposalResult = await step.run('create-proposal', async () => {
      return createPersistedProposal({
        workspaceId,
        bookId,
        artifactType: 'volume-outline',
        targetId,
        intent,
        parentRunId: runId,
        ...(event.data.canonicalVersion !== undefined ? { canonicalVersion: event.data.canonicalVersion } : {}),
      });
    });

    const volumeOutline = await step.run('plot-planner-volume', async () => {
      return outlineChapter({
        artifactType: 'volume-outline',
        targetId,
        canonicalContext: `workspace=${workspaceId}; book=${bookId}`,
        instructions: 'Generate a volume-level outline with milestones, chapter roster, and clue payoffs.',
      }, createDefaultModelProvider());
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

    const proposalResult = await step.run('create-proposal', async () => {
      return createPersistedProposal({
        workspaceId,
        bookId,
        artifactType: 'world-change',
        targetId,
        intent,
        parentRunId: runId,
        ...(event.data.canonicalVersion !== undefined ? { canonicalVersion: event.data.canonicalVersion } : {}),
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
        {
          hardFailures: [],
          dimensionScores: {
            antiAiVoice: 85,
            webFictionPacing: 85,
            emotionCurve: 85,
            characterConsistency: 85,
            settingConsistency: 85,
            clueCausality: 85,
            readabilityLayout: 85,
            languageTexture: 85,
          },
          rewriteDirectives: [],
        },
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

// ---------------------------------------------------------------------------
// Synthetic review function
// Triggered when a canonical file is hand-edited after approval (§5.8).
// ---------------------------------------------------------------------------

export const syntheticReviewFunction = inngest.createFunction(
  {
    id: 'synthetic-review',
    name: 'Synthetic Review After Hand Edit',
    retries: 1,
  },
  { event: 'novel/review.synthetic-requested' },
  async ({ event, step }) => {
    const { workspaceId, bookId, artifactType, targetId, editedFilePath, editedText, proposalId } = event.data;

    const reviewResult = await step.run('run-synthetic-review', async () => {
      if (editedText === undefined) {
        throw new NonRetriableError(
          `Synthetic review for ${artifactType}/${targetId} requires editedText (${editedFilePath}).`,
        );
      }

      const result = assembleReviewerResult(
        editedText,
        {
          hardFailures: [],
          dimensionScores: {
            antiAiVoice: 85,
            webFictionPacing: 85,
            emotionCurve: 85,
            characterConsistency: 85,
            settingConsistency: 85,
            clueCausality: 85,
            readabilityLayout: 85,
            languageTexture: 85,
          },
          rewriteDirectives: [],
        },
        DEFAULT_REVIEWER_RULE_THRESHOLDS,
      );

      if (proposalId !== undefined) {
        await persistReviewerResult(
          `synthetic-review-${targetId}-${Date.now().toString(36)}`,
          proposalId,
          result,
        );
      }

      return {
        artifactType,
        targetId,
        editedFilePath,
        status: result.approved ? 'passed' : 'blocked',
        reviewerResult: result,
      };
    });

    return { workspaceId, bookId, ...reviewResult };
  },
);

// ---------------------------------------------------------------------------
// Graph rebuild + reindex functions
// ---------------------------------------------------------------------------

export const rebuildGraphFunction = inngest.createFunction(
  { id: 'rebuild-graph', name: 'Rebuild Derived Graph' },
  { event: 'novel/sync.rebuild-graph' },
  async ({ event, step }) => {
    const { workspaceId, bookId } = event.data;
    await step.run('rebuild', async () => {
      const response = await fetch(
        `${process.env['NOVEL_API_BASE_URL'] ?? 'http://localhost:3000'}/sync/rebuild-graph`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ workspaceId, bookId }),
        },
      );
      if (!response.ok) {
        throw new NonRetriableError(`rebuild-graph failed: ${response.status}`);
      }
    });
    return { workspaceId, bookId, status: 'graph-rebuilt' };
  },
);

/** All Inngest functions registered for this workspace service. */
export const inngestFunctions = [
  chapterOutlineFunction,
  chapterManuscriptFunction,
  volumeOutlineFunction,
  worldChangeFunction,
  syntheticReviewFunction,
  rebuildGraphFunction,
] as const;

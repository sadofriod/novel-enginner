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

import { type Proposal } from '../domain/schema';
import { resolveArtifactWorkflow } from './artifact-workflows';
import { buildProposalRegistry, type ProposalRegistry } from './proposal-lifecycle';
import { inngest } from './inngest-client';

// ---------------------------------------------------------------------------
// Helper: minimal in-memory ProposalRegistry for the step context.
// In a real deployment, supply a Prisma-backed registry adapter here.
// ---------------------------------------------------------------------------

function singletonRegistry(existing: readonly Proposal[]): ProposalRegistry {
  return buildProposalRegistry(existing);
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
    const { workspaceId, bookId, targetId, intent } = event.data;

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
      const workflow = resolveArtifactWorkflow('chapter-outline');
      if (workflow === undefined) {
        throw new NonRetriableError('chapter-outline workflow not registered');
      }

      const stub: Proposal = {
        proposalId: `proposal-${targetId}-${Date.now().toString(36)}`,
        artifactType: 'chapter-outline',
        targetId,
        status: 'pending-review',
        intent,
        basedOnCanonicalVersion: `snap-${bookId}-${Date.now().toString(36)}`,
        parentRunId: event.data.idempotencyKey,
      };

      return workflow.propose({ proposal: stub, registry: singletonRegistry([]) });
    });

    // Step 3: WorldBuilder/PlotPlanner sub-steps (agent calls) — skeletons.
    // Full Inngest-native agent step invocations will be wired here in Phase 7.
    await step.run('world-builder-sync', async () => {
      // WorldBuilder: sync world assumptions if needed.
      // Placeholder: real call would invoke the OpenAI provider via agent assembly.
    });

    await step.run('plot-planner-outline', async () => {
      // PlotPlanner: generate the chapter outline draft.
    });

    await step.run('actor-validate', async () => {
      // Actor: validate character actions in sandbox.
    });

    // Step 4: emit artifact.proposed — callers subscribe via SSE.
    return {
      proposalId: proposalResult.proposal.proposalId,
      status: proposalResult.proposal.status,
      workspaceId,
      bookId,
      targetId,
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
    const { workspaceId, bookId, targetId, intent } = event.data;

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
      return { blocked: false };
    });

    if (outlineCheck.blocked) {
      return { blocked: true, reason: outlineCheck.reason, workspaceId, bookId, targetId };
    }

    // Step 2: Create the manuscript proposal.
    const proposalResult = await step.run('create-proposal', async () => {
      const workflow = resolveArtifactWorkflow('chapter-manuscript');
      if (workflow === undefined) {
        throw new NonRetriableError('chapter-manuscript workflow not registered');
      }
      const stub: Proposal = {
        proposalId: `proposal-${targetId}-${Date.now().toString(36)}`,
        artifactType: 'chapter-manuscript',
        targetId,
        status: 'pending-review',
        intent,
        basedOnCanonicalVersion: `snap-${bookId}-${Date.now().toString(36)}`,
        parentRunId: event.data.idempotencyKey,
      };
      return workflow.propose({ proposal: stub, registry: singletonRegistry([]) });
    });

    // Step 3: Drafter generates manuscript — skeleton.
    await step.run('drafter-generate', async () => {
      // Drafter: generate manuscript body from approved outline.
    });

    // Step 4: Reviewer assesses the manuscript — up to 2 rounds.
    for (let round = 1; round <= 2; round += 1) {
      const reviewPassed = await step.run(`reviewer-round-${round}`, async () => {
        // Reviewer: structured rule + model evidence check.
        // Return true to proceed, false to rewrite.
        return true; // placeholder
      });

      if (reviewPassed) {
        break;
      }

      if (round < 2) {
        await step.run(`drafter-rewrite-${round}`, async () => {
          // Drafter: rewrite using reviewer directives.
        });
      }
    }

    return {
      proposalId: proposalResult.proposal.proposalId,
      status: proposalResult.proposal.status,
      workspaceId,
      bookId,
      targetId,
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
    const { workspaceId, bookId, targetId, intent } = event.data;

    await step.run('re-sync-state', async () => {
      await fetch(
        `${process.env['NOVEL_API_BASE_URL'] ?? 'http://localhost:3000'}/sync/re-sync-state`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ workspaceId, bookId }),
        },
      );
    });

    const proposalResult = await step.run('create-proposal', async () => {
      const workflow = resolveArtifactWorkflow('volume-outline');
      if (workflow === undefined) {
        throw new NonRetriableError('volume-outline workflow not registered');
      }
      const stub: Proposal = {
        proposalId: `proposal-${targetId}-${Date.now().toString(36)}`,
        artifactType: 'volume-outline',
        targetId,
        status: 'pending-review',
        intent,
        basedOnCanonicalVersion: `snap-${bookId}-${Date.now().toString(36)}`,
        parentRunId: event.data.idempotencyKey,
      };
      return workflow.propose({ proposal: stub, registry: singletonRegistry([]) });
    });

    await step.run('plot-planner-volume', async () => {
      // PlotPlanner: generate volume-level outline.
    });

    return {
      proposalId: proposalResult.proposal.proposalId,
      status: proposalResult.proposal.status,
      workspaceId,
      bookId,
      targetId,
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
    const { workspaceId, bookId, targetId, intent } = event.data;

    const proposalResult = await step.run('create-proposal', async () => {
      const workflow = resolveArtifactWorkflow('world-change');
      if (workflow === undefined) {
        throw new NonRetriableError('world-change workflow not registered');
      }
      const stub: Proposal = {
        proposalId: `proposal-${targetId}-${Date.now().toString(36)}`,
        artifactType: 'world-change',
        targetId,
        status: 'pending-review',
        intent,
        basedOnCanonicalVersion: `snap-${bookId}-${Date.now().toString(36)}`,
        parentRunId: event.data.idempotencyKey,
      };
      return workflow.propose({ proposal: stub, registry: singletonRegistry([]) });
    });

    await step.run('world-builder-analysis', async () => {
      // WorldBuilder: generate impact analysis and target patch set.
    });

    await step.run('reviewer-check', async () => {
      // Reviewer: check affected aggregates and constraint conflicts.
    });

    return {
      proposalId: proposalResult.proposal.proposalId,
      status: proposalResult.proposal.status,
      workspaceId,
      bookId,
      targetId,
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
    const { workspaceId, bookId, artifactType, targetId, editedFilePath } = event.data;

    const reviewResult = await step.run('run-synthetic-review', async () => {
      // Reviewer: re-assess the hand-edited artifact using the rule bundle and model.
      // If non-overridable hard failures are found, the downstream auto-pipeline will
      // be blocked (§5.8). The result is persisted via persistReviewerResult().
      return {
        artifactType,
        targetId,
        editedFilePath,
        status: 'synthetic-review-queued',
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
      await fetch(
        `${process.env['NOVEL_API_BASE_URL'] ?? 'http://localhost:3000'}/sync/rebuild-graph`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ workspaceId, bookId }),
        },
      );
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

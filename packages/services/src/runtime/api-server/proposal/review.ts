import type { CommandEnvelope, Proposal, SubmitReviewInput } from '../../../domain';
import { SubmitReviewInputSchema } from '../../../domain/schema';
import type { WorkspaceValidity } from '../../../domain/values';
import { persistProposal } from '../../../persistence/proposals';
import { persistReviewSubmit } from '../../../persistence/reviews';
import {
  applySubmitReview,
  buildProposalChain,
  buildSubmitReview,
  countUnresolvedThreads,
  hasSubmitReviewContent,
  ReviewWorkflowError,
  type IdentityAndTime,
  type SubmitReviewResult,
} from '../../../workflow/review-lifecycle';
import { RunEventBus } from '../../event-bus';
import { RuntimeStore } from '../../store';
import type { CreateApiServerOptions } from '../types';

/** Injects the runtime identity/clock into the pure review assembler. */
function runtimeIdentity(): IdentityAndTime {
  return {
    id: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
  };
}

export function parseSubmitReviewPayload(
  payload: Record<string, unknown>,
): SubmitReviewInput | undefined {
  const parsed = SubmitReviewInputSchema.safeParse(payload);
  if (!parsed.success) {
    return undefined;
  }
  if (!hasSubmitReviewContent(parsed.data)) {
    return undefined;
  }
  return parsed.data;
}

export interface ApplySubmitReviewCommandInput {
  readonly store: RuntimeStore;
  readonly eventBus: RunEventBus;
  readonly envelope: CommandEnvelope;
  readonly runId: string;
  readonly payload: Record<string, unknown>;
  readonly getWorkspaceValidity: (workspaceId: string) => WorkspaceValidity;
  readonly options: CreateApiServerOptions;
}

interface SubmitReviewContext {
  readonly proposal: Proposal;
  readonly assembled: SubmitReviewResult;
}

type LoadedContext = { readonly ok: true; readonly value: SubmitReviewContext } | { readonly ok: false; readonly reason: string };

function loadSubmitReviewContext(input: ApplySubmitReviewCommandInput): LoadedContext {
  if (input.envelope.artifactType === undefined || input.envelope.targetId === undefined) {
    return { ok: false, reason: 'command target is missing' };
  }
  const reviewInput = parseSubmitReviewPayload(input.payload);
  if (reviewInput === undefined) {
    return { ok: false, reason: 'invalid submit-review payload' };
  }
  const proposal = input.store.getActiveProposal(input.envelope.artifactType, input.envelope.targetId);
  if (proposal === undefined) {
    return { ok: false, reason: 'active proposal not found' };
  }
  const assembled = buildSubmitReview(reviewInput, runtimeIdentity());
  return { ok: true, value: { proposal, assembled } };
}

type AppliedReview = { readonly ok: true; readonly proposal: Proposal } | { readonly ok: false; readonly reason: string };

function tryApplySubmitReview(proposal: Proposal, assembled: SubmitReviewResult): AppliedReview {
  try {
    return { ok: true, proposal: applySubmitReview(proposal, assembled.review) };
  } catch (error) {
    if (error instanceof ReviewWorkflowError) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
}

function publishStepFailure(input: ApplySubmitReviewCommandInput, reason: string): void {
  input.eventBus.publish({
    type: 'run.step.failed',
    runId: input.runId,
    emittedAt: new Date().toISOString(),
    data: { reason },
  });
}

function persistToStore(store: RuntimeStore, assembled: SubmitReviewResult, proposal: Proposal): void {
  store.saveProposal(proposal);
  store.saveProposalReview(assembled.review);
  for (const thread of assembled.threads) {
    store.saveReviewThread(thread);
  }
  for (const comment of assembled.comments) {
    store.saveReviewComment(comment);
  }
}

async function persistSubmittedReview(
  input: ApplySubmitReviewCommandInput,
  proposal: Proposal,
  assembled: SubmitReviewResult,
): Promise<void> {
  const persistenceEnabled =
    process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
  if (persistenceEnabled) {
    await persistReviewSubmit(assembled.review, assembled.threads, assembled.comments);
    await persistProposal(input.envelope.workspaceId, input.envelope.bookId, proposal);
  }
}

function syncArtifactStatus(store: RuntimeStore, proposal: Proposal): void {
  const existing = store.getArtifact(proposal.artifactType, proposal.targetId);
  store.upsertArtifact({
    ...existing,
    artifactType: proposal.artifactType,
    targetId: proposal.targetId,
    canonicalStatus: existing?.canonicalStatus ?? 'draft',
    activeProposalId: proposal.proposalId,
    proposalStatus: proposal.status,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Applies the `submit-review` command: parses the draft comments, assembles the
 * atomic review (GitHub PR-review style), moves the proposal to `changes-requested`,
 * persists the review + threads + comments, and publishes the outcome event.
 */
export async function applySubmitReviewCommand(
  input: ApplySubmitReviewCommandInput,
): Promise<void> {
  if (input.envelope.intent !== 'submit-review') {
    return;
  }
  const loaded = loadSubmitReviewContext(input);
  if (!loaded.ok) {
    publishStepFailure(input, loaded.reason);
    return;
  }
  const applied = tryApplySubmitReview(loaded.value.proposal, loaded.value.assembled);
  if (!applied.ok) {
    publishStepFailure(input, applied.reason);
    return;
  }
  const assembled = loaded.value.assembled;
  persistToStore(input.store, assembled, applied.proposal);
  await persistSubmittedReview(input, applied.proposal, assembled);
  syncArtifactStatus(input.store, applied.proposal);
  input.eventBus.publish({
    type: 'proposal.review-submitted',
    runId: input.runId,
    emittedAt: new Date().toISOString(),
    data: {
      proposalId: applied.proposal.proposalId,
      status: applied.proposal.status,
      threadCount: assembled.threads.length,
      commentCount: assembled.comments.length,
    },
  });
}

/** Counts unresolved threads across the proposal's full supersedes chain (approve gating). */
export function countUnresolvedThreadsForProposalChain(
  store: RuntimeStore,
  proposal: Proposal,
): number {
  const chain = buildProposalChain(store.listAllProposals(), proposal.proposalId);
  let count = 0;
  for (const entry of chain) {
    count += countUnresolvedThreads(store.listReviewThreads(entry.proposalId));
  }
  return count;
}

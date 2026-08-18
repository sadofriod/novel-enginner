import type { Proposal } from '../domain';
import { assembleReviewerResult, DEFAULT_REVIEWER_RULE_THRESHOLDS, type ModelEvidence } from '../agent/reviewer';
import { loadReviewerRules } from '../agent/reviewer-rules-loader';
import type { ReviewerResult } from '../domain';
import { persistCanonicalDraft } from '../persistence/proposal-drafts';
import { persistProposal } from '../persistence/proposals';
import { persistReviewerResultAndLinkProposal } from '../persistence/reviewer-results';
import { resolveArtifactWorkflow } from '../workflow/artifact-workflows';
import { buildProposalRegistry } from '../workflow/proposal-lifecycle';
import { serializeCanonicalMarkdown } from '../workspace/markdown';
import { createArtifactDraftFromContent } from './canonical-draft';
import type { RunEvent, RunEventBus } from './event-bus';
import { RuntimeStore, type CanonicalDraft } from './store';
import type { CreateApiServerOptions } from './api-server/types';

export interface AuthorProposedArtifactInput {
  readonly store: RuntimeStore;
  readonly eventBus: RunEventBus;
  readonly runId: string;
  readonly workspaceId: string;
  readonly bookId: string;
  readonly artifactType: Proposal['artifactType'];
  readonly targetId: string;
  readonly intent: 'propose' | 'regenerate';
  /** Canonical frontmatter collected by the per-artifact-type web form. */
  readonly frontmatter: Record<string, unknown>;
  readonly sections?: Record<string, string>;
  readonly scenes?: Record<string, string>;
  readonly options: CreateApiServerOptions;
}

export interface AuthorProposedArtifactResult {
  readonly proposalId: string;
  readonly events: readonly RunEvent[];
}

function persistenceEnabled(): boolean {
  return process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalRecord<T>(value: unknown): Record<string, T> | undefined {
  return isRecord(value) ? value as Record<string, T> : undefined;
}

function hasAuthorArtifactContent(payload: Record<string, unknown>): boolean {
  return isRecord(payload['frontmatter'])
    || isRecord(payload['sections'])
    || isRecord(payload['scenes'])
    || typeof payload['content'] === 'string';
}

function authorContentFromPayload(payload: Record<string, unknown>): {
  readonly frontmatter: Record<string, unknown>;
  readonly sections?: Record<string, string>;
  readonly scenes?: Record<string, string>;
} {
  const sections = optionalRecord<string>(payload['sections']);
  const scenes = optionalRecord<string>(payload['scenes']);
  return {
    frontmatter: optionalRecord<unknown>(payload['frontmatter']) ?? {},
    ...(sections === undefined ? {} : { sections }),
    ...(scenes === undefined ? {} : { scenes }),
  };
}

function serializeAuthorContent(input: AuthorProposedArtifactInput): string {
  return serializeCanonicalMarkdown({
    frontmatter: input.frontmatter,
    ...(input.sections === undefined ? {} : { sections: input.sections }),
    ...(input.scenes === undefined ? {} : { scenes: input.scenes }),
  });
}

async function persistAuthorProposal(input: AuthorProposedArtifactInput, proposal: Proposal, draft: CanonicalDraft): Promise<void> {
  if (input.options.persistProposalDecision !== undefined) {
    await input.options.persistProposalDecision(input.workspaceId, input.bookId, proposal);
    return;
  }
  if (persistenceEnabled()) {
    await persistProposal(input.workspaceId, input.bookId, proposal);
    await persistCanonicalDraft({ draft, proposal });
  }
}

/**
 * Neutral model-evidence for the author-local rule-gate: no model hard failures and
 * full dimension scores, so `assembleReviewerResult` reduces to the deterministic
 * rule checks (banned terms, paragraph length). Semantic review is intentionally
 * skipped for content the author typed directly in the web form.
 */
const NEUTRAL_MODEL_EVIDENCE: ModelEvidence = {
  hardFailures: [],
  dimensionScores: {
    antiAiVoice: 100,
    webFictionPacing: 100,
    emotionCurve: 100,
    characterConsistency: 100,
    settingConsistency: 100,
    clueCausality: 100,
    readabilityLayout: 100,
    languageTexture: 100,
  },
  rewriteDirectives: [],
};

/**
 * Runs the rule-gate review for an author-local proposal at propose time, persisting
 * the ReviewerResult and linking it to the proposal. The proposal advances to
 * `pending-approval`; `approve` then enforces the linked review outcome
 * (review-required / review-rejected), so approval never silently no-ops.
 */
async function reviewAuthorProposal(input: {
  readonly proposal: Proposal;
  readonly prose: string;
  readonly store: RuntimeStore;
  readonly options: CreateApiServerOptions;
}): Promise<{ readonly proposal: Proposal; readonly reviewerResult: ReviewerResult }> {
  const workspaceRoot = input.options.workspaceRoot ?? process.cwd();
  let rules = DEFAULT_REVIEWER_RULE_THRESHOLDS;
  try {
    rules = await loadReviewerRules(workspaceRoot);
  } catch {
    // Fall back to the defaults when the rules file is unavailable (e.g. unit tests).
  }
  const reviewerResult = assembleReviewerResult(input.prose, NEUTRAL_MODEL_EVIDENCE, rules);
  const reviewResultId = `review-${input.proposal.proposalId}-${Date.now().toString(36)}`;
  input.store.saveReviewerResult(reviewResultId, reviewerResult);
  if (persistenceEnabled()) {
    await persistReviewerResultAndLinkProposal(reviewResultId, input.proposal.proposalId, reviewerResult);
  }
  return { proposal: { ...input.proposal, status: 'pending-approval', latestReviewResultId: reviewResultId }, reviewerResult };
}

/**
 * Applies a `propose`/`regenerate` whose artifact content was authored in the web
 * console (per-artifact-type form), creating the proposal and its validated
 * canonical draft synchronously instead of dispatching to an Agent workflow.
 * Returns `undefined` when the payload carries no author-authored content, so the
 * regular dispatch path can run.
 */
export async function tryApplyAuthorProposedArtifact(
  payload: Record<string, unknown>,
  input: Omit<AuthorProposedArtifactInput, 'frontmatter' | 'sections' | 'scenes'>,
): Promise<AuthorProposedArtifactResult | undefined> {
  if (!hasAuthorArtifactContent(payload)) {
    return undefined;
  }
  return applyAuthorProposedArtifact({ ...input, ...authorContentFromPayload(payload) });
}

async function reviewAndPersistAuthorProposal(input: AuthorProposedArtifactInput, proposal: Proposal, draft: CanonicalDraft): Promise<Proposal> {
  const prose = [...Object.values(input.sections ?? {}), ...Object.values(input.scenes ?? {})].join('\n\n');
  // Persist the initial proposal row first so the auto-review link (a DB foreign key)
  // has a row to point at, then run the rule-gate review and advance to pending-approval.
  await persistAuthorProposal(input, proposal, draft);
  const reviewed = await reviewAuthorProposal({ proposal, prose, store: input.store, options: input.options });
  input.store.saveProposal(reviewed.proposal);
  if (persistenceEnabled()) {
    await persistProposal(input.workspaceId, input.bookId, reviewed.proposal);
  }
  return reviewed.proposal;
}

export async function applyAuthorProposedArtifact(input: AuthorProposedArtifactInput): Promise<AuthorProposedArtifactResult> {
  const snapshot = input.store.getLastKnownSnapshot(input.workspaceId);
  if (snapshot === undefined) {
    throw new Error('propose with author content requires a synced canonical snapshot.');
  }
  const workflow = resolveArtifactWorkflow(input.artifactType);
  if (workflow === undefined) {
    throw new Error(`workflow is not registered for ${input.artifactType}`);
  }

  const proposalId = `proposal-${input.runId}`;
  const proposal: Proposal = {
    proposalId,
    artifactType: input.artifactType,
    targetId: input.targetId,
    status: 'pending-review',
    intent: input.intent,
    origin: 'author',
    basedOnCanonicalVersion: snapshot.snapshotId,
    parentRunId: input.runId,
  };
  const active = input.store.getActiveProposal(input.artifactType, input.targetId);
  const registry = buildProposalRegistry(active === undefined ? [] : [active]);
  const created = workflow.propose({ proposal, registry });
  input.store.saveProposal(created.created);
  if (created.superseded !== undefined) {
    input.store.saveProposal(created.superseded);
  }

  const content = serializeAuthorContent(input);
  const draft = createArtifactDraftFromContent({
    proposalId,
    artifactType: input.artifactType,
    targetId: input.targetId,
    content,
  });
  input.store.saveCanonicalDraft(draft);
  const reviewed = await reviewAndPersistAuthorProposal(input, created.created, draft);

  const emittedAt = new Date().toISOString();
  const events: RunEvent[] = [
    { type: 'run.step.completed', runId: input.runId, emittedAt, data: { proposalId, artifactType: input.artifactType, targetId: input.targetId, status: reviewed.status } },
    { type: 'artifact.proposed', runId: input.runId, emittedAt, data: { proposalId, artifactType: input.artifactType, targetId: input.targetId, status: reviewed.status } },
  ];
  return { proposalId, events };
}

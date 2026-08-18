import type { Proposal } from '../domain';
import { resolveOptimizeAgent, type OptimizeAgent } from '../agent/resolve-optimize-agent';
import type { ModelProvider } from '../agent/provider';
import { persistCanonicalDraft } from '../persistence/proposal-drafts';
import { persistProposal } from '../persistence/proposals';
import { createOptimizeProposal } from '../workflow/optimize-proposal';
import { readCanonicalWorkspaceFiles } from '../workspace/file-watcher';
import { describeError } from '../common/errors';
import { createChildLogger } from '../common/logger';
import type { CreateApiServerOptions } from './api-server/types';
import { createArtifactDraftFromContent, resolveCanonicalPathForArtifact } from './canonical-draft';
import { buildContentFieldDiff } from './artifact-diff';
import type { RunEvent, RunEventBus } from './event-bus';
import { buildOptimizedDraftContent } from './optimize-draft';
import { RuntimeStore } from './store';
import type { WorkspaceFileInput } from '../workspace/sync-engine';
import { basename } from 'node:path';

const logger = createChildLogger('optimize-proposal');

export interface OptimizeArtifactInput {
  readonly store: RuntimeStore;
  readonly eventBus: RunEventBus;
  readonly runId: string;
  readonly workspaceId: string;
  readonly bookId: string;
  readonly artifactType: Proposal['artifactType'];
  readonly targetId: string;
  readonly provider: ModelProvider;
  readonly options: CreateApiServerOptions;
}

export interface OptimizeArtifactResult {
  readonly proposalId: string;
  readonly events: readonly RunEvent[];
}

function publishFailure(eventBus: RunEventBus, runId: string, reason: string): void {
  logger.warn({ runId, reason }, 'Optimize step failed');
  eventBus.publish({ type: 'run.step.failed', runId, emittedAt: new Date().toISOString(), data: { reason } });
}

function persistenceEnabled(): boolean {
  return process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
}

/** Resolves the canonical path for the artifact, tolerating types without a resolvable single-file path. */
function resolveContextPath(artifactType: Proposal['artifactType'], targetId: string): string | undefined {
  try {
    return resolveCanonicalPathForArtifact(artifactType, targetId);
  } catch {
    return undefined;
  }
}

/** Loads canonical files through the injected reader, defaulting to the workspace watcher. */
async function readCanonicalContextFiles(options: CreateApiServerOptions): Promise<readonly WorkspaceFileInput[]> {
  const readFiles = options.readCanonicalFiles ?? readCanonicalWorkspaceFiles;
  return readFiles(options.workspaceRoot ?? process.cwd());
}

/** Loads the current canonical content of the artifact being optimized, or `''` when no matching canonical file is found. */
async function loadCanonicalContext(input: OptimizeArtifactInput): Promise<string> {
  const files = await readCanonicalContextFiles(input.options);
  const canonicalPath = resolveContextPath(input.artifactType, input.targetId);
  const match =
    canonicalPath === undefined
      ? files.find((file) => basename(file.path) === `${input.targetId}.md`)
      : files.find((file) => file.path === canonicalPath);
  return match?.content ?? '';
}

interface GeneratedContent {
  readonly text: string;
  readonly modelId: string;
}

/**
 * Builds the optimize task instructions demanding a SUBSTANTIVE rewrite: local
 * models trend conservative when told to "preserve" everything, which produced
 * proposals nearly identical to the canonical text. The instructions now make the
 * rewrite amplitude explicit (eliminate AI-flavor filler, vary rhythm, cut padding)
 * while still pinning the canonical identity and facts so the diff stays reviewable.
 */
export function buildOptimizeInstructions(targetId: string, artifactType: string): string {
  return [
    `Rewrite the canonical artifact "${targetId}" (${artifactType}) as a SUBSTANTIVE revision, not a light copyedit. The prose body must change meaningfully so the diff vs the original is large and clearly visible.`,
    '1. Eliminate AI-flavor filler and empty scenic description wherever found (仿佛/宛如/不禁/深邃/心头一紧/难以言喻/这一刻/无声/静静/似乎): replace with concrete action, precise sensory detail, or delete outright.',
    '2. Vary sentence rhythm; break up monotonous parallel clauses; remove formulaic "action + internal monologue" filler beats; tighten redundant setup and transitions.',
    '3. Keep only beats that serve the scene purpose, emotion curve, and foreshadowing; cut padding that merely inflates word count.',
    '4. Preserve the canonical identity and facts: frontmatter (id/volumeId/status/sceneAnchorIds), scene anchors, characters, relationships, world facts, and plot beats. Do NOT invent new facts or change the story.',
    'Return ONLY the complete rewritten canonical Markdown (frontmatter + scenes/sections) so it can be validated and diffed.',
  ].join('\n');
}

/** Runs the content-producing agent; publishes a recoverable failure when the model call throws. */
async function runOptimizeAgent(
  input: OptimizeArtifactInput,
  agent: OptimizeAgent,
  current: string,
): Promise<GeneratedContent | undefined> {
  try {
    const generated = await agent({
      artifactType: input.artifactType,
      targetId: input.targetId,
      canonicalContext: current,
      instructions: buildOptimizeInstructions(input.targetId, input.artifactType),
    }, input.provider);
    return { text: generated.text, modelId: generated.modelId };
  } catch (cause) {
    const detail = describeError(cause);
    logger.error({
      runId: input.runId,
      artifactType: input.artifactType,
      targetId: input.targetId,
      error: detail.message,
      stack: detail.stack,
    }, 'Optimize agent failed');
    publishFailure(input.eventBus, input.runId, detail.message);
    return undefined;
  }
}

/**
 * Builds the validated draft for the optimized content and persists the proposal
 * + draft (in-memory, and to the DB when persistence is enabled so the approval
 * queue and approve-with-persistence can find them after a restart); returns a
 * failure reason when the draft is invalid.
 */
async function persistOptimizeDraft(input: OptimizeArtifactInput, proposal: Proposal, content: string): Promise<string | undefined> {
  try {
    const draft = createArtifactDraftFromContent({ proposalId: proposal.proposalId, artifactType: input.artifactType, targetId: input.targetId, content });
    input.store.saveProposal(proposal);
    input.store.saveCanonicalDraft(draft);
    if (persistenceEnabled()) {
      await persistProposal(input.workspaceId, input.bookId, proposal);
      await persistCanonicalDraft({ draft, proposal });
    }
    return undefined;
  } catch (cause) {
    const detail = describeError(cause);
    logger.error({
      runId: input.runId,
      proposalId: proposal.proposalId,
      error: detail.message,
      stack: detail.stack,
    }, 'Failed to persist optimize draft');
    return detail.message;
  }
}

/**
 * Runs the LLM optimize pipeline synchronously for an `optimize` command: resolves
 * the content-producing agent for the artifact type, feeds it the current canonical
 * content as context, and stores the optimized output as a `pending-approval`
 * proposal (origin `generated`) for the author to review. Failure modes (unoptimizable
 * type, missing snapshot, provider error, invalid draft) publish a recoverable
 * `run.step.failed` event and return `undefined`.
 */
export async function tryApplyOptimizeArtifact(input: OptimizeArtifactInput): Promise<OptimizeArtifactResult | undefined> {
  const agent = resolveOptimizeAgent(input.artifactType);
  if (agent === undefined) {
    publishFailure(input.eventBus, input.runId, `artifact type ${input.artifactType} is not optimizable`);
    return undefined;
  }
  const snapshot = input.store.getLastKnownSnapshot(input.workspaceId);
  if (snapshot === undefined) {
    publishFailure(input.eventBus, input.runId, 'canonical snapshot not found');
    return undefined;
  }
  const current = await loadCanonicalContext(input);
  const generated = await runOptimizeAgent(input, agent, current);
  if (generated === undefined) {
    return undefined;
  }
  // Local models often return plain prose instead of a fully-formed canonical file;
  // rebuild the canonical shell so the draft always validates and the author can
  // review the optimized body in the approval queue.
  const content = buildOptimizedDraftContent(current, generated.text);
  const proposal = createOptimizeProposal({ artifactType: input.artifactType, targetId: input.targetId, runId: input.runId, snapshotId: snapshot.snapshotId });
  const draftReason = await persistOptimizeDraft(input, proposal, content);
  if (draftReason !== undefined) {
    publishFailure(input.eventBus, input.runId, draftReason);
    return undefined;
  }
  // Attach the proposal-vs-canonical diff to the artifact summary so the Web
  // console approval detail can render the change (§6.8). syncArtifactSummary later
  // spreads this existing summary, so the diff is preserved.
  input.store.upsertArtifact({
    artifactType: input.artifactType,
    targetId: input.targetId,
    canonicalStatus: 'draft',
    activeProposalId: proposal.proposalId,
    proposalStatus: proposal.status,
    proposalDetail: {
      basedOnCanonicalVersion: snapshot.snapshotId,
      diffs: buildContentFieldDiff(current, content),
    },
    updatedAt: new Date().toISOString(),
  });
  const emittedAt = new Date().toISOString();
  const events: RunEvent[] = [
    { type: 'proposal.created', runId: input.runId, emittedAt, data: { proposalId: proposal.proposalId, artifactType: input.artifactType, targetId: input.targetId } },
    { type: 'proposal.optimized', runId: input.runId, emittedAt, data: { proposalId: proposal.proposalId, status: 'pending-approval', modelId: generated.modelId } },
  ];
  return { proposalId: proposal.proposalId, events };
}

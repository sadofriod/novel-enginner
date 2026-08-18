import type { Proposal } from '../domain';
import { resolveOptimizeAgent, type OptimizeAgent } from '../agent/resolve-optimize-agent';
import type { ModelProvider } from '../agent/provider';
import { createOptimizeProposal } from '../workflow/optimize-proposal';
import { readCanonicalWorkspaceFiles } from '../workspace/file-watcher';
import type { CreateApiServerOptions } from './api-server/types';
import { createArtifactDraftFromContent, resolveCanonicalPathForArtifact } from './canonical-draft';
import type { RunEvent, RunEventBus } from './event-bus';
import { RuntimeStore } from './store';
import type { WorkspaceFileInput } from '../workspace/sync-engine';
import { basename } from 'node:path';

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
  eventBus.publish({ type: 'run.step.failed', runId, emittedAt: new Date().toISOString(), data: { reason } });
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
      instructions: `Optimize the canonical artifact "${input.targetId}" (${input.artifactType}) while preserving its identity, relationships, and canonical Markdown schema. Return only the complete optimized canonical Markdown.`,
    }, input.provider);
    return { text: generated.text, modelId: generated.modelId };
  } catch (cause) {
    publishFailure(input.eventBus, input.runId, cause instanceof Error ? cause.message : String(cause));
    return undefined;
  }
}

/** Builds the validated draft for the optimized content; returns a failure reason when the draft is invalid. */
function persistOptimizeDraft(input: OptimizeArtifactInput, proposal: Proposal, content: string): string | undefined {
  try {
    const draft = createArtifactDraftFromContent({ proposalId: proposal.proposalId, artifactType: input.artifactType, targetId: input.targetId, content });
    input.store.saveProposal(proposal);
    input.store.saveCanonicalDraft(draft);
    return undefined;
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
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
  const proposal = createOptimizeProposal({ artifactType: input.artifactType, targetId: input.targetId, runId: input.runId, snapshotId: snapshot.snapshotId });
  const draftReason = persistOptimizeDraft(input, proposal, generated.text);
  if (draftReason !== undefined) {
    publishFailure(input.eventBus, input.runId, draftReason);
    return undefined;
  }
  const emittedAt = new Date().toISOString();
  const events: RunEvent[] = [
    { type: 'proposal.created', runId: input.runId, emittedAt, data: { proposalId: proposal.proposalId, artifactType: input.artifactType, targetId: input.targetId } },
    { type: 'proposal.optimized', runId: input.runId, emittedAt, data: { proposalId: proposal.proposalId, status: 'pending-approval', modelId: generated.modelId } },
  ];
  return { proposalId: proposal.proposalId, events };
}

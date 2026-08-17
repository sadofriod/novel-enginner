import type { Proposal } from '../domain';
import { persistCanonicalDraft } from '../persistence/proposal-drafts';
import { persistProposal } from '../persistence/proposals';
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

  const draft = createArtifactDraftFromContent({
    proposalId,
    artifactType: input.artifactType,
    targetId: input.targetId,
    content: serializeAuthorContent(input),
  });
  input.store.saveCanonicalDraft(draft);
  await persistAuthorProposal(input, created.created, draft);

  const emittedAt = new Date().toISOString();
  const events: RunEvent[] = [
    { type: 'run.step.completed', runId: input.runId, emittedAt, data: { proposalId, artifactType: input.artifactType, targetId: input.targetId, status: created.created.status } },
    { type: 'artifact.proposed', runId: input.runId, emittedAt, data: { proposalId, artifactType: input.artifactType, targetId: input.targetId, status: created.created.status } },
  ];
  return { proposalId, events };
}

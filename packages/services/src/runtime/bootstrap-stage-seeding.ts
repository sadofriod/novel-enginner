import type { Proposal } from '../domain';
import type { BootstrapSession, BootstrapStage } from '../bootstrap/types';
import { generateProjectBriefProposal } from '../bootstrap/research/research-orchestrator';
import { validateProjectBrief, type ProjectBrief } from '../bootstrap/domain/canonical-artifacts';
import {
  buildChapterOutline,
  buildStoryBlueprint,
  buildVolumeOutline,
  buildWorldFoundation,
} from '../bootstrap/domain/stage-artifacts';
import { generateWorldState } from '../agent/world-builder';
import { outlineChapter } from '../agent/plot-planner';
import type { ModelProvider } from '../agent/provider';
import type { CanonicalEntitySnapshot } from '../workspace/sync-engine';
import { serializeCanonicalMarkdown } from '../workspace/markdown';
import { reSyncState } from '../workspace/sync-engine';
import { readEntityIdFromMarkdown } from '../workspace/read-entity-id';
import {
  createBootstrapArtifactDraft,
  createChapterOutlineDraft,
  createVolumeOutlineDraft,
} from './canonical-draft';
import type { ApplyBootstrapCommandInput } from './bootstrap-command-handler';

export const NEW_BOOK_PROPOSAL_STAGES: ReadonlySet<BootstrapStage> = new Set([
  'world-foundation',
  'story-blueprint',
  'volume-outlines',
  'chapter-outline-batch',
]);

/** Artifact type the LLM agent generates for each new-book stage. */
const STAGE_ARTIFACT_TYPE: Readonly<Partial<Record<BootstrapStage, string>>> = {
  'world-foundation': 'world-foundation',
  'story-blueprint': 'story-blueprint',
  'volume-outlines': 'volume-outline',
  'chapter-outline-batch': 'chapter-outline',
};

/** Content-producing agent for each new-book stage (F9: 新书播种 LLM 生成). */
const STAGE_AGENT: Readonly<Partial<Record<BootstrapStage, (input: { readonly artifactType: string; readonly targetId: string; readonly canonicalContext: string; readonly instructions: string }, provider: ModelProvider) => Promise<{ readonly text: string }>>>> = {
  'world-foundation': generateWorldState,
  'story-blueprint': generateWorldState,
  'volume-outlines': outlineChapter,
  'chapter-outline-batch': outlineChapter,
};

function mergeDialogueDraft(merged: Record<string, string>, draft: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(draft)) {
    if (typeof value === 'string' && merged[key] === undefined) {
      merged[key] = value;
    }
  }
}

function gatherDialogueDecisions(store: ApplyBootstrapCommandInput['store'], sessionId: string): Record<string, string | undefined> {
  const merged: Record<string, string> = {};
  for (const revision of store.listBootstrapRevisions(sessionId)) {
    if (revision.draft !== undefined) {
      mergeDialogueDraft(merged, revision.draft);
    }
  }
  return merged;
}

/**
 * Seeds the project-brief proposal, its canonical draft, and the baseline workspace
 * snapshot the moment the five-dialogue gate is passed
 * (docs/architecture/modules/11-bootstrap-and-onboarding.md §11.3). The baseline
 * snapshot gives the proposal a stable `basedOnCanonicalVersion` so the generic
 * approval machinery can approve and commit it.
 */
function seedProjectBriefProposal(
  input: ApplyBootstrapCommandInput,
  session: BootstrapSession,
): void {
  const decisions = gatherDialogueDecisions(input.store, session.id);
  const evidenceIds = input.store.listBootstrapEvidence(session.id).map((evidence) => evidence.id);
  const brief = generateProjectBriefProposal({
    bookId: session.bookId ?? input.envelope.bookId,
    decisions,
    sourceResearchEvidenceIds: evidenceIds,
  });

  const baseline = reSyncState([]);
  input.store.setLastKnownSnapshot(session.workspaceId, baseline.snapshot);
  input.store.setWorkspaceValidity(session.workspaceId, 'clean');

  const proposalId = `proposal-${input.runId}`;
  const proposal: Proposal = {
    proposalId,
    artifactType: 'project-brief',
    targetId: brief.id,
    status: 'pending-approval',
    intent: 'propose',
    origin: 'generated',
    basedOnCanonicalVersion: baseline.snapshot.snapshotId,
    parentRunId: input.runId,
  };
  input.store.saveProposal(proposal);
  const draft = createBootstrapArtifactDraft({
    proposalId,
    artifactType: 'project-brief',
    content: serializeCanonicalMarkdown({ frontmatter: brief }),
  });
  input.store.saveCanonicalDraft(draft);
}

function requireSnapshotEntity(store: ApplyBootstrapCommandInput['store'], workspaceId: string, path: string): CanonicalEntitySnapshot {
  const entity = store.getLastKnownSnapshot(workspaceId)?.entities.get(path);
  if (entity === undefined) {
    throw new Error(`Canonical entity "${path}" is required before continuing the bootstrap.`);
  }
  return entity;
}

function requireApprovedBrief(store: ApplyBootstrapCommandInput['store'], workspaceId: string): ProjectBrief {
  const entity = requireSnapshotEntity(store, workspaceId, 'state/book/project-brief.md');
  return validateProjectBrief(entity.data);
}

interface StageDraftItem {
  readonly artifactType: Proposal['artifactType'];
  readonly targetId: string;
  readonly content: string;
  readonly makeDraft: (proposalId: string, content: string, targetId: string) => import('./store').CanonicalDraft;
}

function saveStageProposalAndDraft(
  input: ApplyBootstrapCommandInput,
  session: BootstrapSession,
  suffix: string,
  item: StageDraftItem,
): void {
  const proposalId = `proposal-${input.runId}${suffix}`;
  const proposal: Proposal = {
    proposalId,
    artifactType: item.artifactType,
    targetId: item.targetId,
    status: 'pending-approval',
    intent: 'propose',
    origin: 'generated',
    basedOnCanonicalVersion: input.store.getLastKnownSnapshot(session.workspaceId)?.snapshotId ?? 'snap-0001',
    parentRunId: input.runId,
  };
  input.store.saveProposal(proposal);
  input.store.saveCanonicalDraft(item.makeDraft(proposalId, item.content, item.targetId));
}

function bootstrapDraftFactory(artifactType: 'world-foundation' | 'story-blueprint'): StageDraftItem['makeDraft'] {
  return (proposalId, content) => createBootstrapArtifactDraft({ proposalId, artifactType, content });
}

/** Resolves the content-producing agent for a new-book stage, or `undefined` when none exists. */
function resolveStageAgent(stage: BootstrapStage): { readonly artifactType: string; readonly agent: NonNullable<(typeof STAGE_AGENT)[BootstrapStage]> } | undefined {
  const artifactType = STAGE_ARTIFACT_TYPE[stage];
  const agent = STAGE_AGENT[stage];
  return artifactType === undefined || agent === undefined ? undefined : { artifactType, agent };
}

/** Runs the stage agent; a provider failure falls back to the template instead of failing the bootstrap. */
async function runStageAgent(
  provider: ModelProvider,
  resolved: { readonly artifactType: string; readonly agent: NonNullable<(typeof STAGE_AGENT)[BootstrapStage]> },
  context: string,
): Promise<string | undefined> {
  try {
    const generated = await resolved.agent({
      artifactType: resolved.artifactType,
      targetId: '',
      canonicalContext: context,
      instructions: `Generate the complete canonical Markdown for the ${resolved.artifactType} new-book stage artifact, preserving every cross-reference to existing canonical entities. Return only the canonical Markdown.`,
    }, provider);
    return generated.text;
  } catch {
    return undefined;
  }
}

/** Generates stage content via the content-producing agent when a provider is configured; `undefined` otherwise. */
async function generateStageContent(
  input: ApplyBootstrapCommandInput,
  stage: BootstrapStage,
  context: string,
): Promise<string | undefined> {
  const provider = input.provideModel?.();
  if (provider === undefined) {
    return undefined;
  }
  const resolved = resolveStageAgent(stage);
  if (resolved === undefined) {
    return undefined;
  }
  return runStageAgent(provider, resolved, context);
}

interface StageArtifactContent {
  readonly targetId: string;
  readonly content: string;
}

/**
 * Resolves the content for a stage artifact: LLM-generated (validated against the
 * canonical draft schema) when a provider is available, otherwise the schema-valid
 * template fallback. F9 新书播种 LLM — the mandatory enforcement stays at the
 * approval gate (generated content requires model evidence), so seeding itself can
 * always produce a valid draft.
 */
async function resolveStageArtifact(
  input: ApplyBootstrapCommandInput,
  stage: BootstrapStage,
  fallback: StageArtifactContent,
  context: string,
  makeDraft: StageDraftItem['makeDraft'],
): Promise<StageArtifactContent> {
  const generated = await generateStageContent(input, stage, context);
  if (generated === undefined) {
    return fallback;
  }
  const targetId = readEntityIdFromMarkdown(generated) ?? fallback.targetId;
  try {
    makeDraft('proposal-probe', generated, targetId);
    return { targetId, content: generated };
  } catch {
    return fallback;
  }
}

function seedWorldFoundationProposal(input: ApplyBootstrapCommandInput, session: BootstrapSession): Promise<void> {
  return (async () => {
    const brief = requireApprovedBrief(input.store, session.workspaceId);
    const world = buildWorldFoundation(brief);
    const artifact = await resolveStageArtifact(
      input,
      'world-foundation',
      { targetId: world.id, content: serializeCanonicalMarkdown({ frontmatter: world }) },
      `Project brief:\n${serializeCanonicalMarkdown({ frontmatter: brief })}`,
      bootstrapDraftFactory('world-foundation'),
    );
    saveStageProposalAndDraft(input, session, '', {
      artifactType: 'world-foundation',
      targetId: artifact.targetId,
      content: artifact.content,
      makeDraft: bootstrapDraftFactory('world-foundation'),
    });
  })();
}

function seedStoryBlueprintProposal(input: ApplyBootstrapCommandInput, session: BootstrapSession): Promise<void> {
  return (async () => {
    const brief = requireApprovedBrief(input.store, session.workspaceId);
    const world = requireSnapshotEntity(input.store, session.workspaceId, 'state/world/world-foundation.md');
    const blueprint = buildStoryBlueprint(brief, world.data as import('../domain/schema-types').WorldFoundation);
    const worldMarkdown = serializeCanonicalMarkdown({ frontmatter: world.data as import('../domain/schema-types').WorldFoundation });
    const artifact = await resolveStageArtifact(
      input,
      'story-blueprint',
      { targetId: blueprint.id, content: serializeCanonicalMarkdown({ frontmatter: blueprint }) },
      `Project brief:\n${serializeCanonicalMarkdown({ frontmatter: brief })}\n\nWorld foundation:\n${worldMarkdown}`,
      bootstrapDraftFactory('story-blueprint'),
    );
    saveStageProposalAndDraft(input, session, '', {
      artifactType: 'story-blueprint',
      targetId: artifact.targetId,
      content: artifact.content,
      makeDraft: bootstrapDraftFactory('story-blueprint'),
    });
  })();
}

function seedVolumeOutlineProposal(input: ApplyBootstrapCommandInput, session: BootstrapSession): Promise<void> {
  return (async () => {
    const brief = requireApprovedBrief(input.store, session.workspaceId);
    const volume = buildVolumeOutline(brief, 1);
    const artifact = await resolveStageArtifact(
      input,
      'volume-outlines',
      { targetId: volume.id, content: serializeCanonicalMarkdown({ frontmatter: volume }) },
      `Project brief:\n${serializeCanonicalMarkdown({ frontmatter: brief })}`,
      (proposalId, content, targetId) => createVolumeOutlineDraft({ proposalId, targetId, content }),
    );
    saveStageProposalAndDraft(input, session, '', {
      artifactType: 'volume-outline',
      targetId: artifact.targetId,
      content: artifact.content,
      makeDraft: (proposalId, content, targetId) => createVolumeOutlineDraft({ proposalId, targetId, content }),
    });
  })();
}

function seedChapterOutlineBatch(input: ApplyBootstrapCommandInput, session: BootstrapSession): Promise<void> {
  return (async () => {
    if (input.store.getActiveProposal('chapter-outline', 'chapter-0001-outline') !== undefined) {
      return;
    }
    const brief = requireApprovedBrief(input.store, session.workspaceId);
    const volume = requireSnapshotEntity(input.store, session.workspaceId, 'state/volumes/volume-001.md');
    const volumeMarkdown = serializeCanonicalMarkdown({ frontmatter: volume.data as import('../domain/schema-types').Volume });
    for (let chapterNumber = 1; chapterNumber <= 3; chapterNumber += 1) {
      const chapter = buildChapterOutline(brief, volume.data as import('../domain/schema-types').Volume, chapterNumber);
      const artifact = await resolveStageArtifact(
        input,
        'chapter-outline-batch',
        { targetId: chapter.id, content: serializeCanonicalMarkdown({ frontmatter: chapter }) },
        `Project brief:\n${serializeCanonicalMarkdown({ frontmatter: brief })}\n\nVolume:\n${volumeMarkdown}\n\nGenerate chapter ${chapterNumber}.`,
        (proposalId, content, targetId) => createChapterOutlineDraft({ proposalId, targetId, content }),
      );
      saveStageProposalAndDraft(input, session, `-ch${chapterNumber}`, {
        artifactType: 'chapter-outline',
        targetId: artifact.targetId,
        content: artifact.content,
        makeDraft: (proposalId, content, targetId) => createChapterOutlineDraft({ proposalId, targetId, content }),
      });
    }
  })();
}

export { seedChapterOutlineBatch };

const STAGE_SEEDERS: Readonly<Partial<Record<BootstrapStage, (input: ApplyBootstrapCommandInput, session: BootstrapSession) => Promise<void>>>> = {
  'project-brief': async (input, session) => seedProjectBriefProposal(input, session),
  'world-foundation': seedWorldFoundationProposal,
  'story-blueprint': seedStoryBlueprintProposal,
  'volume-outlines': seedVolumeOutlineProposal,
  'chapter-outline-batch': seedChapterOutlineBatch,
};

/** Seeds the proposal (and its canonical draft) for the given new-book stage. */
export async function seedStageProposal(input: ApplyBootstrapCommandInput, session: BootstrapSession, stage: BootstrapStage): Promise<boolean> {
  const seeder = STAGE_SEEDERS[stage];
  if (seeder === undefined) {
    return false;
  }
  await seeder(input, session);
  return true;
}

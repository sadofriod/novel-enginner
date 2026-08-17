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
import type { CanonicalEntitySnapshot } from '../workspace/sync-engine';
import { serializeCanonicalMarkdown } from '../workspace/markdown';
import { reSyncState } from '../workspace/sync-engine';
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
    basedOnCanonicalVersion: input.store.getLastKnownSnapshot(session.workspaceId)?.snapshotId ?? 'snap-0001',
    parentRunId: input.runId,
  };
  input.store.saveProposal(proposal);
  input.store.saveCanonicalDraft(item.makeDraft(proposalId, item.content, item.targetId));
}

function bootstrapDraftFactory(artifactType: 'world-foundation' | 'story-blueprint'): StageDraftItem['makeDraft'] {
  return (proposalId, content) => createBootstrapArtifactDraft({ proposalId, artifactType, content });
}

function seedWorldFoundationProposal(input: ApplyBootstrapCommandInput, session: BootstrapSession): void {
  const brief = requireApprovedBrief(input.store, session.workspaceId);
  const world = buildWorldFoundation(brief);
  saveStageProposalAndDraft(input, session, '', {
    artifactType: 'world-foundation',
    targetId: world.id,
    content: serializeCanonicalMarkdown({ frontmatter: world }),
    makeDraft: bootstrapDraftFactory('world-foundation'),
  });
}

function seedStoryBlueprintProposal(input: ApplyBootstrapCommandInput, session: BootstrapSession): void {
  const brief = requireApprovedBrief(input.store, session.workspaceId);
  const world = requireSnapshotEntity(input.store, session.workspaceId, 'state/world/world-foundation.md');
  const blueprint = buildStoryBlueprint(brief, world.data as import('../domain/schema-types').WorldFoundation);
  saveStageProposalAndDraft(input, session, '', {
    artifactType: 'story-blueprint',
    targetId: blueprint.id,
    content: serializeCanonicalMarkdown({ frontmatter: blueprint }),
    makeDraft: bootstrapDraftFactory('story-blueprint'),
  });
}

function seedVolumeOutlineProposal(input: ApplyBootstrapCommandInput, session: BootstrapSession): void {
  const brief = requireApprovedBrief(input.store, session.workspaceId);
  const volume = buildVolumeOutline(brief, 1);
  saveStageProposalAndDraft(input, session, '', {
    artifactType: 'volume-outline',
    targetId: volume.id,
    content: serializeCanonicalMarkdown({ frontmatter: volume }),
    makeDraft: (proposalId, content, targetId) => createVolumeOutlineDraft({ proposalId, targetId, content }),
  });
}

function seedChapterOutlineBatch(input: ApplyBootstrapCommandInput, session: BootstrapSession): void {
  if (input.store.getActiveProposal('chapter-outline', 'chapter-0001-outline') !== undefined) {
    return;
  }
  const brief = requireApprovedBrief(input.store, session.workspaceId);
  const volume = requireSnapshotEntity(input.store, session.workspaceId, 'state/volumes/volume-001.md');
  for (let chapterNumber = 1; chapterNumber <= 3; chapterNumber += 1) {
    const chapter = buildChapterOutline(brief, volume.data as import('../domain/schema-types').Volume, chapterNumber);
    saveStageProposalAndDraft(input, session, `-ch${chapterNumber}`, {
      artifactType: 'chapter-outline',
      targetId: chapter.id,
      content: serializeCanonicalMarkdown({ frontmatter: chapter }),
      makeDraft: (proposalId, content, targetId) => createChapterOutlineDraft({ proposalId, targetId, content }),
    });
  }
}

export { seedChapterOutlineBatch };

const STAGE_SEEDERS: Readonly<Partial<Record<BootstrapStage, (input: ApplyBootstrapCommandInput, session: BootstrapSession) => void>>> = {
  'project-brief': seedProjectBriefProposal,
  'world-foundation': seedWorldFoundationProposal,
  'story-blueprint': seedStoryBlueprintProposal,
  'volume-outlines': seedVolumeOutlineProposal,
  'chapter-outline-batch': seedChapterOutlineBatch,
};

/** Seeds the proposal (and its canonical draft) for the given new-book stage. */
export function seedStageProposal(input: ApplyBootstrapCommandInput, session: BootstrapSession, stage: BootstrapStage): boolean {
  const seeder = STAGE_SEEDERS[stage];
  if (seeder === undefined) {
    return false;
  }
  seeder(input, session);
  return true;
}

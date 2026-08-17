import type { Proposal } from '../domain';
import type { CanonicalEntityKind } from '../workspace/layout';
import { parseCanonicalMarkdown, serializeCanonicalMarkdown } from '../workspace/markdown';
import { validateCanonicalFile } from '../workspace/sync-engine';
import type { CanonicalDraft } from './store';

const CANONICAL_KIND_BY_ARTIFACT_TYPE: Readonly<Partial<Record<Proposal['artifactType'], CanonicalEntityKind>>> = {
  'project-brief': 'project-brief',
  'world-foundation': 'world-foundation',
  'story-blueprint': 'story-blueprint',
  'volume-outline': 'volume',
  'chapter-outline': 'chapter-outline',
  'chapter-manuscript': 'chapter-manuscript',
  'character-update': 'character',
  'faction-update': 'faction',
  'location-update': 'location',
  'tech-rule-update': 'tech-rule',
  'fact-update': 'fact',
  'relationship-update': 'relationship',
  'resource-update': 'resource',
};

const BOOTSTRAP_PATH_BY_ARTIFACT_TYPE: Readonly<Partial<Record<Proposal['artifactType'], string>>> = {
  'project-brief': 'state/book/project-brief.md',
  'world-foundation': 'state/world/world-foundation.md',
  'story-blueprint': 'state/book/story-blueprint.md',
};

export class CanonicalDraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalDraftValidationError';
  }
}

export function createValidatedCanonicalDraft(draft: CanonicalDraft): CanonicalDraft {
  try {
    validateCanonicalFile({ path: draft.relativePath, content: draft.content });
  } catch (cause) {
    throw new CanonicalDraftValidationError(cause instanceof Error ? cause.message : String(cause));
  }
  return draft;
}

export function createBootstrapArtifactDraft(input: {
  readonly proposalId: string;
  readonly artifactType: 'project-brief' | 'world-foundation' | 'story-blueprint';
  readonly content: string;
}): CanonicalDraft {
  const relativePath = BOOTSTRAP_PATH_BY_ARTIFACT_TYPE[input.artifactType];
  if (relativePath === undefined) {
    throw new CanonicalDraftValidationError(`Bootstrap artifact type "${input.artifactType}" has no canonical path.`);
  }
  return createValidatedCanonicalDraft({ proposalId: input.proposalId, relativePath, content: input.content });
}

function isBootstrapArtifact(artifactType: Proposal['artifactType']): artifactType is 'project-brief' | 'world-foundation' | 'story-blueprint' {
  return artifactType === 'project-brief' || artifactType === 'world-foundation' || artifactType === 'story-blueprint';
}

function entityPathForArtifact(artifactType: Proposal['artifactType'], targetId: string): string | undefined {
  const kind = CANONICAL_KIND_BY_ARTIFACT_TYPE[artifactType];
  return kind === undefined ? undefined : resolveExpectedPath(kind, targetId);
}

const SPECIAL_PATH_BY_ARTIFACT_TYPE: Readonly<Partial<Record<Proposal['artifactType'], (targetId: string) => string>>> = {
  'chapter-outline': (targetId) => `state/chapters/${targetId}.md`,
  'volume-outline': (targetId) => `state/volumes/${targetId}.md`,
};

/**
 * Resolves the single-file canonical path for an author-proposed artifact. Entity
 * types derive their path from `kind + targetId`; bootstrap types use their fixed
 * contract paths.
 */
export function resolveCanonicalPathForArtifact(artifactType: Proposal['artifactType'], targetId: string): string {
  const bootstrapPath = BOOTSTRAP_PATH_BY_ARTIFACT_TYPE[artifactType];
  if (bootstrapPath !== undefined) {
    return bootstrapPath;
  }
  if (artifactType === 'chapter-manuscript') {
    throw new CanonicalDraftValidationError('chapter-manuscript path requires volumeId from its content; use createChapterManuscriptDraft.');
  }
  const specialPath = SPECIAL_PATH_BY_ARTIFACT_TYPE[artifactType];
  const expectedPath = specialPath === undefined
    ? entityPathForArtifact(artifactType, targetId)
    : specialPath(targetId);
  if (expectedPath === undefined) {
    throw new CanonicalDraftValidationError(`Artifact type "${artifactType}" has no single-file canonical draft.`);
  }
  return expectedPath;
}

function createSpecializedDraft(input: {
  readonly proposalId: string;
  readonly artifactType: Proposal['artifactType'];
  readonly targetId: string;
  readonly content: string;
}): CanonicalDraft | undefined {
  if (input.artifactType === 'chapter-outline') {
    return createChapterOutlineDraft({ proposalId: input.proposalId, targetId: input.targetId, content: input.content });
  }
  if (input.artifactType === 'volume-outline') {
    return createVolumeOutlineDraft({ proposalId: input.proposalId, targetId: input.targetId, content: input.content });
  }
  if (input.artifactType === 'chapter-manuscript') {
    return createChapterManuscriptDraft({ proposalId: input.proposalId, targetId: input.targetId, content: input.content });
  }
  if (input.artifactType === 'world-change') {
    throw new CanonicalDraftValidationError('world-change is a multi-file patch; it cannot be authored as a single canonical draft.');
  }
  return undefined;
}

/**
 * Builds a validated canonical draft from content an author provided in the web
 * console, dispatching to the per-artifact-type draft creator so the result is
 * checked against the layout rule, kind, target id, and path contracts before it
 * can become a proposal draft.
 */
export function createArtifactDraftFromContent(input: {
  readonly proposalId: string;
  readonly artifactType: Proposal['artifactType'];
  readonly targetId: string;
  readonly content: string;
}): CanonicalDraft {
  if (isBootstrapArtifact(input.artifactType)) {
    return createBootstrapArtifactDraft({ proposalId: input.proposalId, artifactType: input.artifactType, content: input.content });
  }
  const specialized = createSpecializedDraft(input);
  if (specialized !== undefined) {
    return specialized;
  }
  const relativePath = resolveCanonicalPathForArtifact(input.artifactType, input.targetId);
  return validateCanonicalDraftForProposal(
    { proposalId: input.proposalId, relativePath, content: input.content },
    { artifactType: input.artifactType, targetId: input.targetId },
  );
}

export function validateCanonicalDraftForProposal(
  draft: CanonicalDraft,
  proposal: Pick<Proposal, 'artifactType' | 'targetId'>,
): CanonicalDraft {
  const validatedDraft = createValidatedCanonicalDraft(draft);
  const expectedKind = CANONICAL_KIND_BY_ARTIFACT_TYPE[proposal.artifactType];
  if (expectedKind === undefined) {
    throw new CanonicalDraftValidationError(`Artifact type "${proposal.artifactType}" has no single-file canonical draft.`);
  }

  const entity = validateCanonicalFile({ path: validatedDraft.relativePath, content: validatedDraft.content });
  const entityId = readEntityId(entity.data);
  validateProposalTarget(validatedDraft, entity.kind, entityId, expectedKind, proposal);
  validateEntityPath(validatedDraft, expectedKind, entityId);
  return validatedDraft;
}

export function createChapterOutlineDraft(input: {
  readonly proposalId: string;
  readonly targetId: string;
  readonly content: string;
}): CanonicalDraft {
  const draft: CanonicalDraft = {
    proposalId: input.proposalId,
    relativePath: `state/chapters/${input.targetId}.md`,
    content: input.content,
  };
  return validateCanonicalDraftForProposal(draft, {
    artifactType: 'chapter-outline',
    targetId: input.targetId,
  });
}

export function createVolumeOutlineDraft(input: {
  readonly proposalId: string;
  readonly targetId: string;
  readonly content: string;
}): CanonicalDraft {
  const draft: CanonicalDraft = {
    proposalId: input.proposalId,
    relativePath: `state/volumes/${input.targetId}.md`,
    content: input.content,
  };
  return validateCanonicalDraftForProposal(draft, {
    artifactType: 'volume-outline',
    targetId: input.targetId,
  });
}

export function createApprovedCanonicalDraft(
  draft: CanonicalDraft,
  proposal: Pick<Proposal, 'artifactType' | 'targetId'>,
): CanonicalDraft {
  if (proposal.artifactType !== 'chapter-outline' && proposal.artifactType !== 'chapter-manuscript') {
    return validateCanonicalDraftForProposal(draft, proposal);
  }

  const parsed = parseCanonicalMarkdown(draft.content);
  const frontmatter = readFrontmatter(parsed.frontmatter);
  const approvedDraft = {
    ...draft,
    content: serializeCanonicalMarkdown({
      frontmatter: { ...frontmatter, status: 'approved' },
      sections: parsed.sections,
      scenes: parsed.scenes,
    }),
  };
  return validateCanonicalDraftForProposal(approvedDraft, proposal);
}

export function createChapterManuscriptDraft(input: {
  readonly proposalId: string;
  readonly targetId: string;
  readonly content: string;
}): CanonicalDraft {
  const parsed = parseCanonicalMarkdown(input.content);
  const volumeId = readVolumeId(parsed.frontmatter);
  const chapterId = input.targetId.replace(/-manuscript$/, '');
  const draft: CanonicalDraft = {
    proposalId: input.proposalId,
    relativePath: `manuscript/${volumeId}/${chapterId}.md`,
    content: input.content,
  };
  return validateCanonicalDraftForProposal(draft, {
    artifactType: 'chapter-manuscript',
    targetId: input.targetId,
  });
}

function validateProposalTarget(
  draft: CanonicalDraft,
  entityKind: string,
  entityId: string | undefined,
  expectedKind: CanonicalEntityKind,
  proposal: Pick<Proposal, 'artifactType' | 'targetId'>,
): void {
  const expectedEntityId = proposal.artifactType === 'chapter-manuscript'
    ? proposal.targetId.replace(/-manuscript$/, '')
    : proposal.targetId;
  if (entityKind === expectedKind && entityId === expectedEntityId) {
    return;
  }
  throw new CanonicalDraftValidationError(
    `Draft "${draft.relativePath}" does not match ${proposal.artifactType}/${proposal.targetId}.`,
  );
}

function validateEntityPath(draft: CanonicalDraft, kind: CanonicalEntityKind, entityId: string | undefined): void {
  if (entityId === undefined) {
    return;
  }
  const expectedPath = resolveExpectedPath(kind, entityId);
  if (expectedPath === undefined || draft.relativePath === expectedPath) {
    return;
  }
  throw new CanonicalDraftValidationError(`Draft path "${draft.relativePath}" does not match entity "${entityId}".`);
}

function resolveExpectedPath(kind: CanonicalEntityKind, entityId: string): string | undefined {
  const directoryByKind: Readonly<Partial<Record<CanonicalEntityKind, string>>> = {
    volume: 'state/volumes',
    'chapter-outline': 'state/chapters',
    character: 'state/characters',
    fact: 'state/facts',
    relationship: 'state/relationships',
    resource: 'state/resources',
    faction: 'state/factions',
    location: 'state/locations',
    'tech-rule': 'state/tech-rules',
  };
  const directory = directoryByKind[kind];
  return directory === undefined ? undefined : `${directory}/${entityId}.md`;
}

function readEntityId(data: unknown): string | undefined {
  if (data === null || typeof data !== 'object' || !('id' in data)) {
    return undefined;
  }
  return typeof data.id === 'string' ? data.id : undefined;
}

function readFrontmatter(frontmatter: unknown): Record<string, unknown> {
  if (frontmatter !== null && typeof frontmatter === 'object' && !Array.isArray(frontmatter)) {
    return frontmatter as Record<string, unknown>;
  }
  throw new CanonicalDraftValidationError('Canonical Markdown frontmatter must be an object.');
}

function readVolumeId(frontmatter: unknown): string {
  const value = readFrontmatter(frontmatter)['volumeId'];
  if (typeof value !== 'string') {
    throw new CanonicalDraftValidationError('Chapter manuscript frontmatter requires volumeId.');
  }
  return value;
}
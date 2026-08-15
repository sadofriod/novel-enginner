import type { Proposal } from '../domain';
import type { CanonicalEntityKind } from '../workspace/layout';
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

function validateProposalTarget(
  draft: CanonicalDraft,
  entityKind: string,
  entityId: string | undefined,
  expectedKind: CanonicalEntityKind,
  proposal: Pick<Proposal, 'artifactType' | 'targetId'>,
): void {
  if (entityKind === expectedKind && entityId === proposal.targetId) {
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
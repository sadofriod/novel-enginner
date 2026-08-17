/* eslint-disable complexity */
import type { CanonicalEntityKind } from '../layout';

import type { CanonicalEntitySnapshot, WorkspaceFileError, WorkspaceSnapshot } from './types';

interface EntityReferenceRule {
  readonly field: string;
  readonly targetKind?: CanonicalEntityKind;
  readonly targetKinds?: readonly CanonicalEntityKind[];
}

const ENTITY_REFERENCE_RULES: Readonly<Record<CanonicalEntitySnapshot['kind'], readonly EntityReferenceRule[]>> = {
  'project-brief': [],
  'world-foundation': [
    { field: 'projectBriefRef', targetKind: 'project-brief' },
  ],
  'story-blueprint': [
    { field: 'projectBriefRef', targetKind: 'project-brief' },
    { field: 'worldFoundationRef', targetKind: 'world-foundation' },
  ],
  book: [
    { field: 'activeVolumeId', targetKind: 'volume' },
    { field: 'globalPromises', targetKind: 'planning-anchor' },
    { field: 'globalConstraints', targetKind: 'planning-anchor' },
  ],
  volume: [
    { field: 'chapterRoster', targetKind: 'chapter-outline' },
    { field: 'requiredCluePayoffs', targetKind: 'plot-clue' },
    { field: 'milestones', targetKind: 'planning-anchor' },
  ],
  'chapter-outline': [
    { field: 'volumeId', targetKind: 'volume' },
    { field: 'activeClueIds', targetKind: 'plot-clue' },
    { field: 'resolveClueIds', targetKind: 'plot-clue' },
    { field: 'introduceClueIds', targetKind: 'plot-clue' },
    { field: 'sceneSkeleton.locationId', targetKind: 'location' },
    { field: 'sceneSkeleton.participantCharacterIds', targetKind: 'character' },
  ],
  'chapter-manuscript': [
    { field: 'volumeId', targetKind: 'volume' },
    { field: 'basedOnOutlineId', targetKind: 'chapter-outline' },
  ],
  character: [
    { field: 'knowledgeLedger.factId', targetKind: 'fact' },
    { field: 'relationshipIds', targetKind: 'relationship' },
    { field: 'resourceIds', targetKind: 'resource' },
  ],
  fact: [],
  relationship: [],
  resource: [],
  faction: [
    { field: 'resourceIds', targetKind: 'resource' },
    { field: 'relationshipIds', targetKind: 'relationship' },
    { field: 'knownByCharacters', targetKind: 'character' },
  ],
  location: [
    { field: 'parentLocation', targetKind: 'location' },
    { field: 'controlFaction', targetKind: 'faction' },
  ],
  'tech-rule': [],
  'plot-clue': [
    { field: 'resolveTargetVolume', targetKind: 'volume' },
    { field: 'knownByCharacterIds', targetKind: 'character' },
    { field: 'misledCharacterIds', targetKind: 'character' },
    { field: 'dependencyClueIds', targetKind: 'plot-clue' },
    { field: 'conflictClueIds', targetKind: 'plot-clue' },
  ],
  'planning-anchor': [
    { field: 'ownerRef', targetKinds: ['book', 'volume'] },
    { field: 'relatedClueIds', targetKind: 'plot-clue' },
    { field: 'targetChapterIds', targetKind: 'chapter-outline' },
  ],
};

function valuesForReference(value: unknown): readonly string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value) && value.every((item): item is string => typeof item === 'string')) {
    return value;
  }
  return [];
}

function valuesForReferenceField(data: Record<string, unknown>, field: string): readonly string[] {
  const fields = field.split('.');
  const resolve = (value: unknown, remainingFields: readonly string[]): readonly string[] => {
    if (remainingFields.length === 0) {
      return valuesForReference(value);
    }
    if (Array.isArray(value)) {
      return value.flatMap((item) => resolve(item, remainingFields));
    }
    if (typeof value !== 'object' || value === null) {
      return [];
    }
    const [nextField, ...restFields] = remainingFields;
    return resolve((value as Record<string, unknown>)[nextField ?? ''], restFields);
  };

  return resolve(data, fields);
}

export function validateEntityReferences(
  entities: ReadonlyMap<string, CanonicalEntitySnapshot>,
): readonly WorkspaceFileError[] {
  const targetsByKind = new Map<CanonicalEntityKind, Set<string>>();
  for (const entity of entities.values()) {
    const ids = targetsByKind.get(entity.kind as CanonicalEntityKind) ?? new Set<string>();
    const entityId = (entity.data as { id?: unknown }).id;
    if (typeof entityId === 'string') {
      ids.add(entityId);
    }
    targetsByKind.set(entity.kind as CanonicalEntityKind, ids);
  }

  const errors: WorkspaceFileError[] = [];
  for (const entity of entities.values()) {
    const rules = ENTITY_REFERENCE_RULES[entity.kind as CanonicalEntityKind] ?? [];
    const data = entity.data as Record<string, unknown>;
    for (const rule of rules) {
      const targetIds = valuesForReferenceField(data, rule.field);
      const targetKinds = rule.targetKinds ?? (rule.targetKind === undefined ? [] : [rule.targetKind]);
      const knownTargetIds = new Set(
        targetKinds.flatMap((targetKind) => [...(targetsByKind.get(targetKind) ?? new Set<string>())]),
      );
      for (const targetId of targetIds) {
        if (!knownTargetIds.has(targetId) && targetKinds.length > 0) {
          errors.push({
            path: entity.path,
            reason: `Reference "${targetId}" in ${rule.field} does not resolve to a ${targetKinds.join(' or ')} entity.`,
          });
        }
      }
    }
  }
  return errors;
}

export function validateChapterContracts(
  entities: ReadonlyMap<string, CanonicalEntitySnapshot>,
): readonly WorkspaceFileError[] {
  const outlineById = new Map<string, CanonicalEntitySnapshot>();
  const manuscripts: CanonicalEntitySnapshot[] = [];

  for (const entity of entities.values()) {
    if (entity.kind === 'chapter-outline') {
      const id = (entity.data as { id?: unknown }).id;
      if (typeof id === 'string') {
        outlineById.set(id, entity);
      }
    } else if (entity.kind === 'chapter-manuscript') {
      manuscripts.push(entity);
    }
  }

  const errors: WorkspaceFileError[] = [];
  for (const manuscript of manuscripts) {
    const manuscriptData = manuscript.data as { chapterNumber?: unknown; displayTitle?: unknown; basedOnOutlineId?: unknown };
    if (typeof manuscriptData.basedOnOutlineId !== 'string') {
      continue;
    }
    const outline = outlineById.get(manuscriptData.basedOnOutlineId);
    if (outline === undefined) {
      continue;
    }
    const outlineData = outline.data as { chapterNumber?: unknown; displayTitle?: unknown; status?: unknown };

    if (
      outlineData.displayTitle !== undefined &&
      manuscriptData.displayTitle !== undefined &&
      outlineData.displayTitle !== manuscriptData.displayTitle
    ) {
      errors.push({
        path: manuscript.path,
        reason: `Chapter ${manuscriptData.chapterNumber ?? 'unknown'} manuscript displayTitle must match the approved outline displayTitle.`,
      });
    }

    if (
      typeof manuscriptData.chapterNumber === 'number' &&
      typeof outlineData.chapterNumber === 'number' &&
      manuscriptData.chapterNumber !== outlineData.chapterNumber
    ) {
      errors.push({
        path: manuscript.path,
        reason: `Chapter ${manuscriptData.chapterNumber} manuscript must bind the matching outline chapter number.`,
      });
    }

    if (outlineData.status !== 'approved') {
      errors.push({
        path: manuscript.path,
        reason: `Chapter ${manuscriptData.chapterNumber ?? 'unknown'} manuscript must bind an approved outline before canonical commit.`,
      });
    }
  }

  return errors;
}

export function resolveInvalidReferencePaths(
  entities: Map<string, CanonicalEntitySnapshot>,
  previousSnapshot: WorkspaceSnapshot | undefined,
  referenceErrors: readonly WorkspaceFileError[],
): Set<string> {
  const invalidReferencePaths = new Set(referenceErrors.map((error) => error.path));
  for (const path of invalidReferencePaths) {
    const previousEntity = previousSnapshot?.entities.get(path);
    if (previousEntity === undefined) {
      entities.delete(path);
    } else {
      entities.set(path, previousEntity);
    }
  }
  return invalidReferencePaths;
}

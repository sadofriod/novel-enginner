/* eslint-disable complexity */

import type { WorkspaceValidity } from '../domain/values';

import { MarkdownContractError, parseCanonicalMarkdown } from './markdown';
import { resolveLayoutRuleForPath, type CanonicalEntityKind } from './layout';

export interface WorkspaceFileError {
  readonly path: string;
  readonly reason: string;
}

export interface CanonicalEntitySnapshot {
  readonly path: string;
  readonly kind: string;
  readonly data: unknown;
  readonly contentHash: string;
}

export interface WorkspaceSnapshot {
  readonly snapshotId: string;
  readonly entities: ReadonlyMap<string, CanonicalEntitySnapshot>;
}

export interface ReSyncStateResult {
  readonly validity: WorkspaceValidity;
  readonly snapshot: WorkspaceSnapshot;
  readonly errors: readonly WorkspaceFileError[];
  readonly changedPaths: readonly string[];
}

export interface WorkspaceFileInput {
  readonly path: string;
  readonly content: string;
}

function hashContent(content: string): string {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (Math.imul(31, hash) + content.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(16);
}

function parseCanonicalJson(file: WorkspaceFileInput): unknown {
  try {
    return JSON.parse(file.content) as unknown;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new MarkdownContractError(`Failed to parse JSON for "${file.path}": ${message}`);
  }
}

export function validateCanonicalFile(file: WorkspaceFileInput): CanonicalEntitySnapshot {
  const rule = resolveLayoutRuleForPath(file.path);
  if (rule === undefined) {
    throw new MarkdownContractError(`Path "${file.path}" does not match any canonical layout rule.`);
  }

  const isJson = file.path.endsWith('.json');
  const parsedMarkdown = isJson ? undefined : parseCanonicalMarkdown(file.content);
  const payload = isJson ? parseCanonicalJson(file) : parsedMarkdown?.frontmatter;
  const result = rule.schema.safeParse(payload);
  if (!result.success) {
    throw new MarkdownContractError(
      `Frontmatter for "${file.path}" failed ${rule.kind} schema validation: ${result.error.message}`,
    );
  }

  if (!isJson && rule.kind === 'chapter-manuscript' && parsedMarkdown !== undefined) {
    const frontmatter = result.data as { sceneAnchorIds?: readonly string[] };
    const declaredIds = frontmatter.sceneAnchorIds ?? [];
    const bodySceneIds = new Set(parsedMarkdown.scenes.keys());

    const missing = declaredIds.filter((id) => !bodySceneIds.has(id));
    const extra = [...bodySceneIds].filter((id) => !declaredIds.includes(id));

    if (missing.length > 0 || extra.length > 0) {
      const details: string[] = [];
      if (missing.length > 0) {
        details.push(`missing body anchors: ${missing.join(', ')}`);
      }
      if (extra.length > 0) {
        details.push(`undeclared body anchors: ${extra.join(', ')}`);
      }
      throw new MarkdownContractError(
        `Scene anchor mismatch in "${file.path}": ${details.join('; ')}.`,
      );
    }
  }

  return {
    path: file.path,
    kind: rule.kind,
    data: result.data,
    contentHash: hashContent(file.content),
  };
}

function nextSnapshotId(previous: WorkspaceSnapshot | undefined): string {
  const previousSequence = previous?.snapshotId.split('-').pop();
  const sequenceNumber = previousSequence !== undefined && /^\d+$/.test(previousSequence)
    ? Number.parseInt(previousSequence, 10) + 1
    : 1;
  return `snap-${sequenceNumber.toString().padStart(4, '0')}`;
}

/**
 * Reconciles the current on-disk canonical files against the previous last-known-good
 * snapshot. This is the pure core of the `re-sync-state` flow described in
 * docs/architecture/modules/02-canonical-workspace.md §2.6:
 * - every canonical file is re-parsed and re-validated,
 * - files that fail to parse do not overwrite the last good snapshot for that path,
 * - the workspace becomes `invalid` if any canonical file currently fails validation,
 * - the workspace becomes `dirty` if nothing failed but something changed since the
 *   previous snapshot (still catching up on derived indices),
 * - the workspace is `clean` when nothing changed and nothing is broken.
 */
function ingestFile(
  file: WorkspaceFileInput,
  entities: Map<string, CanonicalEntitySnapshot>,
  changedPaths: string[],
  errors: WorkspaceFileError[],
): void {
  try {
    const entitySnapshot = validateCanonicalFile(file);
    const previousEntity = entities.get(file.path);
    if (previousEntity?.contentHash !== entitySnapshot.contentHash) {
      changedPaths.push(file.path);
    }
    entities.set(file.path, entitySnapshot);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    errors.push({ path: file.path, reason });
  }
}

function removeDeletedEntities(
  entities: Map<string, CanonicalEntitySnapshot>,
  seenPaths: ReadonlySet<string>,
  changedPaths: string[],
): void {
  for (const previousPath of entities.keys()) {
    if (!seenPaths.has(previousPath)) {
      entities.delete(previousPath);
      changedPaths.push(previousPath);
    }
  }
}

function resolveValidity(errors: readonly WorkspaceFileError[], changedPaths: readonly string[]): WorkspaceValidity {
  if (errors.length > 0) {
    return 'invalid';
  }
  return changedPaths.length > 0 ? 'dirty' : 'clean';
}

function ingestCanonicalFiles(
  files: readonly WorkspaceFileInput[],
  entities: Map<string, CanonicalEntitySnapshot>,
): { readonly changedPaths: string[]; readonly errors: WorkspaceFileError[]; readonly seenPaths: Set<string> } {
  const changedPaths: string[] = [];
  const errors: WorkspaceFileError[] = [];
  const seenPaths = new Set<string>();

  for (const file of files) {
    if (resolveLayoutRuleForPath(file.path) === undefined) {
      continue;
    }
    seenPaths.add(file.path);
    ingestFile(file, entities, changedPaths, errors);
  }

  return { changedPaths, errors, seenPaths };
}

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

function validateEntityReferences(
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

function validateChapterContracts(
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

function resolveInvalidReferencePaths(
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

function buildSnapshot(
  validity: WorkspaceValidity,
  previousSnapshot: WorkspaceSnapshot | undefined,
  entities: Map<string, CanonicalEntitySnapshot>,
): WorkspaceSnapshot {
  const snapshotId =
    validity === 'invalid' || (validity === 'clean' && previousSnapshot !== undefined)
      ? (previousSnapshot?.snapshotId ?? nextSnapshotId(undefined))
      : nextSnapshotId(previousSnapshot);
  return { snapshotId, entities };
}

export function reSyncState(
  files: readonly WorkspaceFileInput[],
  previousSnapshot?: WorkspaceSnapshot,
): ReSyncStateResult {
  const entities = new Map<string, CanonicalEntitySnapshot>(previousSnapshot?.entities ?? []);
  const { changedPaths, errors, seenPaths } = ingestCanonicalFiles(files, entities);
  removeDeletedEntities(entities, seenPaths, changedPaths);
  const referenceErrors = validateEntityReferences(entities);
  resolveInvalidReferencePaths(entities, previousSnapshot, referenceErrors);
  errors.push(...referenceErrors);
  const chapterContractErrors = validateChapterContracts(entities);
  resolveInvalidReferencePaths(entities, previousSnapshot, chapterContractErrors);
  errors.push(...chapterContractErrors);

  const validity = resolveValidity(errors, changedPaths);
  const snapshot = buildSnapshot(validity, previousSnapshot, entities);

  return { validity, snapshot, errors, changedPaths };
}

export function isWriteBlocked(validity: WorkspaceValidity): boolean {
  return validity === 'dirty' || validity === 'invalid';
}

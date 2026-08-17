import type { WorkspaceValidity } from '../../domain/values';
import { resolveLayoutRuleForPath } from '../layout';

import type { CanonicalEntitySnapshot, WorkspaceFileError, WorkspaceFileInput, WorkspaceSnapshot } from './types';
import { validateCanonicalFile } from './validate';

export function nextSnapshotId(previous: WorkspaceSnapshot | undefined): string {
  const previousSequence = previous?.snapshotId.split('-').pop();
  const sequenceNumber = previousSequence !== undefined && /^\d+$/.test(previousSequence)
    ? Number.parseInt(previousSequence, 10) + 1
    : 1;
  return `snap-${sequenceNumber.toString().padStart(4, '0')}`;
}

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

export function removeDeletedEntities(
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

export function resolveValidity(
  errors: readonly WorkspaceFileError[],
  changedPaths: readonly string[],
): WorkspaceValidity {
  if (errors.length > 0) {
    return 'invalid';
  }
  return changedPaths.length > 0 ? 'dirty' : 'clean';
}

export function ingestCanonicalFiles(
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

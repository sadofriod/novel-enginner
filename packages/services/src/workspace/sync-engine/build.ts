/* eslint-disable complexity */
import type { WorkspaceValidity } from '../../domain/values';

import { ingestCanonicalFiles, nextSnapshotId, removeDeletedEntities, resolveValidity } from './ingest';
import { resolveInvalidReferencePaths, validateChapterContracts, validateEntityReferences } from './references';

import type {
  CanonicalEntitySnapshot,
  ReSyncStateResult,
  WorkspaceFileInput,
  WorkspaceSnapshot,
} from './types';

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

/**
 * Reconciles the current on-disk canonical files against the previous last-known-good
 * snapshot. This is the pure core of the `re-sync-state` flow described in
 * docs/architecture/modules/02-canonical-workspace.md §2.6.
 */
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

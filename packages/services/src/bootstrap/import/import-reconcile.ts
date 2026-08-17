import type { WorkspaceValidity } from '../../domain/values';
import {
  reSyncState,
  type ReSyncStateResult,
  type WorkspaceFileInput,
  type WorkspaceSnapshot,
} from '../../workspace/sync-engine';

export interface ImportReconcileResult {
  readonly validity: WorkspaceValidity;
  readonly snapshot: WorkspaceSnapshot;
  readonly errors: ReSyncStateResult['errors'];
  readonly unresolvedReferences: readonly string[];
  readonly readyToWrite: boolean;
}

const BROKEN_REFERENCE_PATTERN = /^Reference "([^"]+)" in .+ does not resolve to .+ entity\.$/;

/**
 * Extracts the stable target ids behind "Reference ... does not resolve" errors
 * produced by the sync-engine reference validator, so they can be surfaced in the
 * import health report (docs/architecture/modules/11-bootstrap-and-onboarding.md §11.4).
 */
export function extractUnresolvedReferences(
  errors: readonly { readonly path: string; readonly reason: string }[],
): readonly string[] {
  const ids = new Set<string>();
  for (const error of errors) {
    const match = BROKEN_REFERENCE_PATTERN.exec(error.reason);
    if (match?.[1] !== undefined) {
      ids.add(match[1]);
    }
  }
  return [...ids];
}

/**
 * Runs the canonical parser → validation → reference-diagnosis → snapshot chain over
 * the files a confirmed import just copied, so the import health gate is based on a
 * real re-sync rather than a byte-level copy
 * (docs/architecture/modules/11-bootstrap-and-onboarding.md §11.4).
 */
export function reconcileImportedWorkspace(files: readonly WorkspaceFileInput[]): ImportReconcileResult {
  const reSync = reSyncState(files);
  const unresolvedReferences = extractUnresolvedReferences(reSync.errors);

  return {
    validity: reSync.validity,
    snapshot: reSync.snapshot,
    errors: reSync.errors,
    unresolvedReferences,
    readyToWrite: reSync.validity !== 'invalid' && unresolvedReferences.length === 0,
  };
}

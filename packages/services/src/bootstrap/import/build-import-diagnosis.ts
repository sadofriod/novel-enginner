import type { CanonicalDraft } from '../../runtime/store';
import type { WorkspaceFileInput } from '../../workspace/sync-engine';
import { reconcileImportedWorkspace } from './import-reconcile';

export interface BuildImportDiagnosisInput {
  /** Canonical drafts produced from the import mapping (not yet written to disk). */
  readonly drafts: readonly CanonicalDraft[];
  /** Current canonical workspace files, so references into existing content resolve. */
  readonly existingFiles: readonly WorkspaceFileInput[];
}

export interface BuildImportDiagnosisResult {
  readonly unresolvedReferences: readonly string[];
  readonly ready: boolean;
}

/**
 * Runs the canonical parser → validation → reference-diagnosis pipeline over the
 * proposed import drafts merged with the existing canonical workspace, WITHOUT
 * writing anything to disk. This is the informational phase-1 gate shown to the
 * author before approval; the full gate runs again after commit over the real files.
 */
export function buildImportDiagnosis(input: BuildImportDiagnosisInput): BuildImportDiagnosisResult {
  const files: WorkspaceFileInput[] = [
    ...input.existingFiles,
    ...input.drafts.map((draft) => ({ path: draft.relativePath, content: draft.content })),
  ];
  const reconcile = reconcileImportedWorkspace(files);
  return {
    unresolvedReferences: reconcile.unresolvedReferences,
    ready: reconcile.readyToWrite,
  };
}

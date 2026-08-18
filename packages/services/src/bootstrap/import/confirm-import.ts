import { readFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';

import type { WorkspaceFileInput } from '../../workspace/sync-engine';
import { generateReport } from '../health/health-report';
import type { BootstrapHealthIssue, BootstrapHealthReport } from '../types';
import { buildImportDiagnosis, type BuildImportDiagnosisResult } from './build-import-diagnosis';
import { buildImportProposals, type ImportProposalItem } from './build-import-proposals';
import type { ImportMapping } from './import-mapper';

const REQUIRED_ARTIFACTS = ['project-brief', 'world-foundation', 'story-blueprint', 'volume', 'chapter'] as const;
const ISOLATION_DIRECTORY = 'references/imported/unmapped';

export interface ConfirmImportInput {
  readonly sourceRoot: string;
  readonly targetRoot: string;
  readonly mapping: ImportMapping;
  readonly runId: string;
  readonly snapshotId: string;
  /** Current canonical workspace files, so the informational diagnosis resolves references into existing content. */
  readonly existingFiles?: readonly WorkspaceFileInput[];
}

export interface ConfirmImportResult {
  /** `pending-approval` proposals (origin `imported`) with their canonical drafts. Nothing is written to disk here. */
  readonly proposals: readonly ImportProposalItem[];
  /** Source paths that could not be mapped to a valid canonical proposal. */
  readonly isolatedPaths: readonly string[];
  readonly healthReport: BootstrapHealthReport;
  /** Informational phase-1 gate over the proposed drafts; the full gate runs again after approval + commit. */
  readonly readyToWrite: boolean;
  readonly diagnosis: BuildImportDiagnosisResult;
}

function ensureInsideRoot(root: string, path: string, description: string): string {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(root, path);
  const pathFromRoot = relative(resolvedRoot, resolvedPath);
  if (pathFromRoot.startsWith('..') || pathFromRoot === '') {
    throw new Error(`${description} must remain inside its workspace root.`);
  }
  return resolvedPath;
}

interface ValidatedEntry {
  readonly source: string;
  readonly target: string;
  readonly relativeTarget: string;
  /** `true` when the entry has no canonical target and is quarantined rather than canonicalized. */
  readonly isolated: boolean;
}

function isolationTarget(sourcePath: string): string {
  return `${ISOLATION_DIRECTORY}/${basename(sourcePath)}`;
}

function validateEntries(input: ConfirmImportInput): readonly ValidatedEntry[] {
  if (!input.mapping.approved) {
    throw new Error('Import mapping must be approved before confirmation.');
  }
  const targets = new Set<string>();
  return input.mapping.entries.map((entry) => {
    const source = ensureInsideRoot(input.sourceRoot, entry.sourcePath, 'Import source path');
    const isolated = entry.canonicalTarget === undefined;
    const relativeTarget = isolated ? isolationTarget(entry.sourcePath) : entry.canonicalTarget as string;
    const target = ensureInsideRoot(input.targetRoot, relativeTarget, 'Import target path');
    if (targets.has(relativeTarget)) {
      throw new Error(`Import mapping contains duplicate canonical target "${relativeTarget}".`);
    }
    targets.add(relativeTarget);
    return { source, target, relativeTarget, isolated };
  });
}

function collectIsolationIssues(isolatedPaths: readonly string[]): readonly BootstrapHealthIssue[] {
  return isolatedPaths.map((path) => ({
    code: `isolated-material-${path}`,
    severity: 'warning' as const,
    message: `文件 ${path} 无法可靠映射为 canonical 工件，已隔离到 references/imported/。`,
    fixHint: '人工整理后再通过显式重新导入回流。',
  }));
}

function missingArtifacts(mapping: ImportMapping): readonly string[] {
  const kinds = new Set(mapping.entries.map((entry) => entry.detectedKind));
  return REQUIRED_ARTIFACTS.filter((kind) => !kinds.has(kind));
}

/**
 * Confirms an author-approved import mapping by building `pending-approval`
 * proposals (origin `imported`) with canonical drafts — without writing anything to
 * the canonical workspace until the author approves. The informational phase-1
 * diagnosis (canonical parse → validation → reference-diagnosis) runs over the
 * proposed drafts merged with the existing workspace, so broken references surface
 * before approval; the full gate runs again over real files after commit
 * (docs/architecture/modules/11-bootstrap-and-onboarding.md §11.4).
 */
export async function confirmImport(input: ConfirmImportInput): Promise<ConfirmImportResult> {
  validateEntries(input);
  const readContent = async (sourcePath: string): Promise<string> => readFile(ensureInsideRoot(input.sourceRoot, sourcePath, 'Import source path'), 'utf8');
  const built = await buildImportProposals({ mapping: input.mapping, runId: input.runId, snapshotId: input.snapshotId, readContent });
  const diagnosis = buildImportDiagnosis({ drafts: built.items.map((item) => item.draft), existingFiles: input.existingFiles ?? [] });
  const healthReport = generateReport(
    missingArtifacts(input.mapping),
    diagnosis.unresolvedReferences,
    [],
    collectIsolationIssues(built.isolatedPaths),
  );
  return {
    proposals: built.items,
    isolatedPaths: built.isolatedPaths,
    healthReport,
    readyToWrite: diagnosis.ready,
    diagnosis,
  };
}
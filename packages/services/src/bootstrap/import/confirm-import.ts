import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';

import { generateReport } from '../health/health-report';
import type { BootstrapHealthIssue, BootstrapHealthReport } from '../types';
import type { ImportMapping } from './import-mapper';
import { reconcileImportedWorkspace, type ImportReconcileResult } from './import-reconcile';

const REQUIRED_ARTIFACTS = ['project-brief', 'world-foundation', 'story-blueprint', 'volume', 'chapter'] as const;
const ISOLATION_DIRECTORY = 'references/imported/unmapped';

export interface ConfirmImportInput {
  readonly sourceRoot: string;
  readonly targetRoot: string;
  readonly mapping: ImportMapping;
}

export interface ConfirmImportResult {
  readonly copiedPaths: readonly string[];
  /** Relative paths of unrecognized source material quarantined into `references/imported/`; not canonical. */
  readonly isolatedPaths: readonly string[];
  readonly healthReport: BootstrapHealthReport;
  /** `true` when the copied workspace has no missing artifacts, no broken references, and no canonical validation errors. */
  readonly readyToWrite: boolean;
  readonly reconcile: ImportReconcileResult;
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
 * Copies an author-approved import mapping into a new canonical workspace without
 * altering the source directory, then runs the canonical parser → validation →
 * reference-diagnosis → snapshot pipeline over the copied files so the import health
 * gate reflects a real re-sync state
 * (docs/architecture/modules/11-bootstrap-and-onboarding.md §11.4).
 */
export async function confirmImport(input: ConfirmImportInput): Promise<ConfirmImportResult> {
  const entries = validateEntries(input);
  const contents = await Promise.all(entries.map(async (entry) => ({ ...entry, content: await readFile(entry.source, 'utf8') })));
  await Promise.all(contents.map(async (entry) => {
    await mkdir(dirname(entry.target), { recursive: true });
    await writeFile(entry.target, entry.content, 'utf8');
  }));
  // Isolated material stays quarantined under references/imported/ and does not
  // participate in canonical generation (§11.4).
  const canonicalFiles = contents.filter((entry) => !entry.isolated).map((entry) => ({ path: entry.relativeTarget, content: entry.content }));
  const reconcile = reconcileImportedWorkspace(canonicalFiles);
  const isolatedPaths = contents.filter((entry) => entry.isolated).map((entry) => entry.relativeTarget).sort();
  const healthReport = generateReport(
    missingArtifacts(input.mapping),
    reconcile.unresolvedReferences,
    reconcile.errors,
    collectIsolationIssues(isolatedPaths),
  );
  const reportPath = ensureInsideRoot(input.targetRoot, 'references/imported/health-report.json', 'Health report path');
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(healthReport, null, 2)}\n`, 'utf8');
  return {
    copiedPaths: entries.map((entry) => entry.relativeTarget).sort(),
    isolatedPaths,
    healthReport,
    readyToWrite: healthReport.ready,
    reconcile,
  };
}
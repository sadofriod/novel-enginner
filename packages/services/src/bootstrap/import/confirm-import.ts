import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

import { generateReport } from '../health/health-report';
import type { BootstrapHealthReport } from '../types';
import type { ImportMapping } from './import-mapper';

const REQUIRED_ARTIFACTS = ['project-brief', 'world-foundation', 'story-blueprint', 'volume', 'chapter'] as const;

export interface ConfirmImportInput {
  readonly sourceRoot: string;
  readonly targetRoot: string;
  readonly mapping: ImportMapping;
}

export interface ConfirmImportResult {
  readonly copiedPaths: readonly string[];
  readonly healthReport: BootstrapHealthReport;
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

function validateEntries(input: ConfirmImportInput): readonly { readonly source: string; readonly target: string; readonly relativeTarget: string }[] {
  if (!input.mapping.approved) {
    throw new Error('Import mapping must be approved before confirmation.');
  }
  const targets = new Set<string>();
  return input.mapping.entries.map((entry) => {
    if (entry.canonicalTarget === undefined) {
      throw new Error(`Import entry "${entry.sourcePath}" is missing a canonical target.`);
    }
    const source = ensureInsideRoot(input.sourceRoot, entry.sourcePath, 'Import source path');
    const target = ensureInsideRoot(input.targetRoot, entry.canonicalTarget, 'Import target path');
    if (targets.has(entry.canonicalTarget)) {
      throw new Error(`Import mapping contains duplicate canonical target "${entry.canonicalTarget}".`);
    }
    targets.add(entry.canonicalTarget);
    return { source, target, relativeTarget: entry.canonicalTarget };
  });
}

function missingArtifacts(mapping: ImportMapping): readonly string[] {
  const kinds = new Set(mapping.entries.map((entry) => entry.detectedKind));
  return REQUIRED_ARTIFACTS.filter((kind) => !kinds.has(kind));
}

/** Copies an author-approved import mapping into a new canonical workspace without altering the source directory. */
export async function confirmImport(input: ConfirmImportInput): Promise<ConfirmImportResult> {
  const entries = validateEntries(input);
  const contents = await Promise.all(entries.map(async (entry) => ({ ...entry, content: await readFile(entry.source, 'utf8') })));
  await Promise.all(contents.map(async (entry) => {
    await mkdir(dirname(entry.target), { recursive: true });
    await writeFile(entry.target, entry.content, 'utf8');
  }));
  const healthReport = generateReport(missingArtifacts(input.mapping));
  const reportPath = ensureInsideRoot(input.targetRoot, 'references/imported/health-report.json', 'Health report path');
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(healthReport, null, 2)}\n`, 'utf8');
  return {
    copiedPaths: entries.map((entry) => entry.relativeTarget).sort(),
    healthReport,
  };
}
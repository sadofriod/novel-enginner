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

function toReferenceTarget(sourcePath: string): string {
  const slug = sourcePath
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  const base = slug.length === 0 ? 'imported-reference' : slug;
  return `references/imported/${base}.md`;
}

function isLowConfidenceReference(entry: ImportMapping['entries'][number]): boolean {
  return entry.detectedKind === 'reference' || entry.confidence < 0.5;
}

type ValidatedImportEntry = {
  readonly source: string;
  readonly target: string;
  readonly relativeTarget: string;
  readonly sourcePath: string;
  readonly detectedKind: ImportMapping['entries'][number]['detectedKind'];
  readonly confidence: number;
  readonly notes?: string | undefined;
  readonly fallbackReference: boolean;
};

function validateEntries(input: ConfirmImportInput): readonly ValidatedImportEntry[] {
  if (!input.mapping.approved) {
    throw new Error('Import mapping must be approved before confirmation.');
  }
  const targets = new Set<string>();
  return input.mapping.entries.map((entry) => {
    if (entry.canonicalTarget === undefined && !isLowConfidenceReference(entry)) {
      throw new Error(`Import entry "${entry.sourcePath}" is missing a canonical target.`);
    }
    const source = ensureInsideRoot(input.sourceRoot, entry.sourcePath, 'Import source path');
    const relativeTarget = entry.canonicalTarget ?? toReferenceTarget(entry.sourcePath);
    const target = ensureInsideRoot(input.targetRoot, relativeTarget, 'Import target path');
    if (targets.has(relativeTarget)) {
      throw new Error(`Import mapping contains duplicate canonical target "${relativeTarget}".`);
    }
    targets.add(relativeTarget);
    return {
      source,
      target,
      relativeTarget,
      sourcePath: entry.sourcePath,
      detectedKind: entry.detectedKind,
      confidence: entry.confidence,
      notes: entry.notes,
      fallbackReference: entry.canonicalTarget === undefined,
    };
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
   const body = entry.fallbackReference
     ? `<!-- imported-reference\nsourcePath: ${entry.sourcePath}\ndetectedKind: ${entry.detectedKind}\nconfidence: ${entry.confidence.toFixed(2)}\n${entry.notes === undefined ? '' : `notes: ${entry.notes}\n`}-->\n${entry.content}`
     : entry.content;
   await mkdir(dirname(entry.target), { recursive: true });
   await writeFile(entry.target, body, 'utf8');
  }));
  const unresolvedReferences = entries
   .filter((entry) => entry.fallbackReference)
   .map((entry) => entry.relativeTarget);
  const healthReport = generateReport(missingArtifacts(input.mapping), unresolvedReferences);
  const reportPath = ensureInsideRoot(input.targetRoot, 'references/imported/health-report.json', 'Health report path');
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(healthReport, null, 2)}\n`, 'utf8');
  return {
    copiedPaths: entries.map((entry) => entry.relativeTarget).sort(),
    healthReport,
  };
}
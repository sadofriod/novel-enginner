import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  brokenReferenceWorldFoundationFrontmatter,
  markdown,
  readyImportMapping,
  READY_IMPORT_ENTRIES,
  writeReadyImportSource,
} from './import-test-fixtures';

import { confirmImport } from './confirm-import';
import { approveMapping, createMapping } from './import-mapper';
import { scanDirectory } from './import-scanner';

describe('confirmImport', () => {
  test('copies only an approved mapping into a new canonical root and writes a health report', async () => {
    const sourceRoot = await mkdtemp('/tmp/novel-import-source-');
    const targetRoot = await mkdtemp('/tmp/novel-import-target-');
    await mkdir(join(sourceRoot, 'notes'));
    await writeFile(join(sourceRoot, 'notes', 'reference.md'), 'source notes');
    await writeFile(join(sourceRoot, 'project-brief.md'), 'brief');

    try {
      const result = await confirmImport({
        sourceRoot,
        targetRoot,
        mapping: {
          approved: true,
          summary: 'confirmed',
          entries: [
            { sourcePath: 'project-brief.md', detectedKind: 'project-brief', canonicalTarget: 'state/book/project-brief.md', confidence: 1 },
            { sourcePath: 'notes/reference.md', detectedKind: 'reference', canonicalTarget: 'references/imported/reference.md', confidence: 0.2 },
          ],
        },
      });

      expect(result.copiedPaths).toEqual(['references/imported/reference.md', 'state/book/project-brief.md']);
      expect(await readFile(join(targetRoot, 'state/book/project-brief.md'), 'utf8')).toBe('brief');
      expect(await readFile(join(targetRoot, 'references/imported/reference.md'), 'utf8')).toBe('source notes');
      expect(result.healthReport.missingArtifacts).toContain('world-foundation');
      expect(JSON.parse(await readFile(join(targetRoot, 'references/imported/health-report.json'), 'utf8'))).toMatchObject({ ready: false });
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(targetRoot, { recursive: true, force: true });
    }
  });

  test('runs the canonical pipeline after copying and reports broken references', async () => {
    const sourceRoot = await mkdtemp('/tmp/novel-import-source-');
    const targetRoot = await mkdtemp('/tmp/novel-import-target-');
    await writeFile(join(sourceRoot, 'world-foundation.md'), markdown(brokenReferenceWorldFoundationFrontmatter()));

    try {
      const result = await confirmImport({
        sourceRoot,
        targetRoot,
        mapping: {
          approved: true,
          summary: 'confirmed',
          entries: [
            { sourcePath: 'world-foundation.md', detectedKind: 'world-foundation', canonicalTarget: 'state/world/world-foundation.md', confidence: 1 },
          ],
        },
      });

      expect(result.reconcile.unresolvedReferences).toContain('project-brief-missing');
      expect(result.reconcile.validity).toBe('invalid');
      expect(result.readyToWrite).toBe(false);
      expect(result.healthReport.issues.some((issue) => issue.code === 'broken-reference-project-brief-missing')).toBe(true);
      expect(JSON.parse(await readFile(join(targetRoot, 'references/imported/health-report.json'), 'utf8'))).toMatchObject({ ready: false });
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(targetRoot, { recursive: true, force: true });
    }
  });

  test('marks a complete import as ready to write', async () => {
    const sourceRoot = await mkdtemp('/tmp/novel-import-source-');
    const targetRoot = await mkdtemp('/tmp/novel-import-target-');
    await writeReadyImportSource(sourceRoot);

    try {
      const result = await confirmImport({
        sourceRoot,
        targetRoot,
        mapping: readyImportMapping(),
      });

      expect(result.readyToWrite).toBe(true);
      expect(result.healthReport.ready).toBe(true);
      expect(result.healthReport.missingArtifacts).toEqual([]);
      expect(result.reconcile.unresolvedReferences).toEqual([]);
      expect(result.reconcile.snapshot.entities.size).toBe(6);
      expect(JSON.parse(await readFile(join(targetRoot, 'references/imported/health-report.json'), 'utf8'))).toMatchObject({ ready: true });
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(targetRoot, { recursive: true, force: true });
    }
  });

  test('isolates unrecognized material into references/imported without canonicalizing it (acceptance #12)', async () => {
    const sourceRoot = await mkdtemp('/tmp/novel-import-isolate-');
    const targetRoot = await mkdtemp('/tmp/novel-import-target-');
    await mkdir(join(sourceRoot, 'notes'));
    await writeFile(join(sourceRoot, 'notes', 'scraps.md'), 'unrecognized notes body');
    await writeFile(join(sourceRoot, 'project-brief.md'), 'brief');

    try {
      const result = await confirmImport({
        sourceRoot,
        targetRoot,
        mapping: {
          approved: true,
          summary: 'confirmed',
          entries: [
            { sourcePath: 'project-brief.md', detectedKind: 'project-brief', canonicalTarget: 'state/book/project-brief.md', confidence: 1 },
            { sourcePath: 'notes/scraps.md', detectedKind: 'reference', canonicalTarget: undefined, confidence: 0.2 },
          ],
        },
      });

      expect(result.isolatedPaths).toEqual(['references/imported/unmapped/scraps.md']);
      expect(result.copiedPaths).toContain('references/imported/unmapped/scraps.md');
      expect(await readFile(join(targetRoot, 'references/imported/unmapped/scraps.md'), 'utf8')).toBe('unrecognized notes body');
      expect(result.reconcile.snapshot.entities.has('references/imported/unmapped/scraps.md')).toBe(false);
      expect(result.healthReport.issues.some((issue) => issue.code === 'isolated-material-references/imported/unmapped/scraps.md')).toBe(true);
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(targetRoot, { recursive: true, force: true });
    }
  });

  test('source changes only flow back through an explicit re-import (acceptance #12)', async () => {
    const sourceRoot = await mkdtemp('/tmp/novel-import-source-');
    const targetRoot = await mkdtemp('/tmp/novel-import-target-');
    await writeFile(join(sourceRoot, 'project-brief.md'), 'brief v1');

    try {
      await confirmImport({
        sourceRoot,
        targetRoot,
        mapping: {
          approved: true,
          summary: 'first import',
          entries: [
            { sourcePath: 'project-brief.md', detectedKind: 'project-brief', canonicalTarget: 'state/book/project-brief.md', confidence: 1 },
          ],
        },
      });
      expect(await readFile(join(targetRoot, 'state/book/project-brief.md'), 'utf8')).toBe('brief v1');

      // Editing the original directory must NOT flow back into canonical automatically.
      await writeFile(join(sourceRoot, 'project-brief.md'), 'brief v2');
      expect(await readFile(join(targetRoot, 'state/book/project-brief.md'), 'utf8')).toBe('brief v1');

      // Explicit re-import (re-scan -> new mapping -> re-confirm) is the only flow-back path.
      const scan = scanDirectory(['project-brief.md']);
      const reimport = await confirmImport({
        sourceRoot,
        targetRoot,
        mapping: approveMapping(createMapping(scan.entries)),
      });
      expect(reimport.copiedPaths).toContain('state/book/project-brief.md');
      expect(await readFile(join(targetRoot, 'state/book/project-brief.md'), 'utf8')).toBe('brief v2');
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(targetRoot, { recursive: true, force: true });
    }
  });

  test('rejects unapproved, colliding, and path-traversal mappings before writing files', async () => {
    const sourceRoot = await mkdtemp('/tmp/novel-import-source-');
    const targetRoot = await mkdtemp('/tmp/novel-import-target-');
    await writeFile(join(sourceRoot, 'one.md'), 'one');
    await writeFile(join(sourceRoot, 'two.md'), 'two');
    try {
      await expect(confirmImport({ sourceRoot, targetRoot, mapping: { approved: false, summary: '', entries: [] } })).rejects.toThrow('approved');
      await expect(confirmImport({
        sourceRoot,
        targetRoot,
        mapping: { approved: true, summary: '', entries: [
          { sourcePath: 'one.md', detectedKind: 'reference', canonicalTarget: '../escape.md', confidence: 1 },
        ] },
      })).rejects.toThrow('must remain inside');
      await expect(confirmImport({
        sourceRoot,
        targetRoot,
        mapping: { approved: true, summary: '', entries: [
          { sourcePath: 'one.md', detectedKind: 'reference', canonicalTarget: 'references/imported/a.md', confidence: 1 },
          { sourcePath: 'two.md', detectedKind: 'reference', canonicalTarget: 'references/imported/a.md', confidence: 1 },
        ] },
      })).rejects.toThrow('duplicate canonical target');
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(targetRoot, { recursive: true, force: true });
    }
  });
});
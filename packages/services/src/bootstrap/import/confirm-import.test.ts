import { describe, expect, test } from 'bun:test';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  brokenReferenceWorldFoundationFrontmatter,
  markdown,
  readyImportMapping,
  writeReadyImportSource,
} from './import-test-fixtures';

import { confirmImport } from './confirm-import';
import { approveMapping, createMapping } from './import-mapper';
import { scanDirectory } from './import-scanner';

async function missing(path: string): Promise<boolean> {
  try {
    await access(path);
    return false;
  } catch {
    return true;
  }
}

function projectBriefEntry() {
  return { sourcePath: 'project-brief.md', detectedKind: 'project-brief' as const, canonicalTarget: 'state/book/project-brief.md', confidence: 1 };
}

const PROJECT_BRIEF_MARKDOWN = markdown({
  id: 'project-brief-import',
  bookId: 'book-import-test',
  title: '测试作品',
  genres: ['科幻'],
  targetAudience: '青年读者',
  marketScope: '中文网络连载市场',
  readerPromise: '持续紧张感',
  corePremise: '在规则中追求自由',
  openingHook: '开场事件',
  contentBoundaries: [],
  format: '连载长篇',
  sourceResearchEvidenceIds: [],
  assumptionIds: [],
  status: 'approved',
});

describe('confirmImport', () => {
  test('builds imported proposals without writing canonical files (author approves before commit)', async () => {
    const sourceRoot = await mkdtemp('/tmp/novel-import-source-');
    const targetRoot = await mkdtemp('/tmp/novel-import-target-');
    await mkdir(join(sourceRoot, 'notes'));
    await writeFile(join(sourceRoot, 'project-brief.md'), PROJECT_BRIEF_MARKDOWN);
    await writeFile(join(sourceRoot, 'notes', 'reference.md'), 'source notes');

    try {
      const result = await confirmImport({
        sourceRoot,
        targetRoot,
        mapping: {
          approved: true,
          summary: 'confirmed',
          entries: [
            projectBriefEntry(),
            { sourcePath: 'notes/reference.md', detectedKind: 'reference', canonicalTarget: undefined, confidence: 0.2 },
          ],
        },
        runId: 'run-import-001',
        snapshotId: 'snap-0001',
      });

      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0]?.proposal).toMatchObject({
        artifactType: 'project-brief',
        status: 'pending-approval',
        intent: 'propose',
        origin: 'imported',
        basedOnCanonicalVersion: 'snap-0001',
      });
      expect(result.proposals[0]?.draft.relativePath).toBe('state/book/project-brief.md');
      expect(result.isolatedPaths).toEqual(['notes/reference.md']);
      expect(await missing(join(targetRoot, 'state/book/project-brief.md'))).toBe(true);
      expect(result.healthReport.missingArtifacts).toContain('world-foundation');
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(targetRoot, { recursive: true, force: true });
    }
  });

  test('surfaces broken references in the informational diagnosis before any files are written', async () => {
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
        runId: 'run-import-002',
        snapshotId: 'snap-0001',
      });

      expect(result.diagnosis.unresolvedReferences).toContain('project-brief-missing');
      expect(result.readyToWrite).toBe(false);
      expect(result.healthReport.issues.some((issue) => issue.code === 'broken-reference-project-brief-missing')).toBe(true);
      expect(await missing(join(targetRoot, 'state/world/world-foundation.md'))).toBe(true);
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(targetRoot, { recursive: true, force: true });
    }
  });

  test('marks a complete import as ready to approve', async () => {
    const sourceRoot = await mkdtemp('/tmp/novel-import-source-');
    const targetRoot = await mkdtemp('/tmp/novel-import-target-');
    await writeReadyImportSource(sourceRoot);

    try {
      const result = await confirmImport({
        sourceRoot,
        targetRoot,
        mapping: readyImportMapping(),
        runId: 'run-import-003',
        snapshotId: 'snap-0001',
      });

      expect(result.proposals).toHaveLength(6);
      expect(result.readyToWrite).toBe(true);
      expect(result.healthReport.ready).toBe(true);
      expect(result.healthReport.missingArtifacts).toEqual([]);
      expect(result.diagnosis.unresolvedReferences).toEqual([]);
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(targetRoot, { recursive: true, force: true });
    }
  });

  test('isolates unrecognized material instead of proposing it (acceptance #12)', async () => {
    const sourceRoot = await mkdtemp('/tmp/novel-import-isolate-');
    const targetRoot = await mkdtemp('/tmp/novel-import-target-');
    await mkdir(join(sourceRoot, 'notes'));
    await writeFile(join(sourceRoot, 'notes', 'scraps.md'), 'unrecognized notes body');
    await writeFile(join(sourceRoot, 'project-brief.md'), PROJECT_BRIEF_MARKDOWN);

    try {
      const result = await confirmImport({
        sourceRoot,
        targetRoot,
        mapping: {
          approved: true,
          summary: 'confirmed',
          entries: [
            projectBriefEntry(),
            { sourcePath: 'notes/scraps.md', detectedKind: 'reference', canonicalTarget: undefined, confidence: 0.2 },
          ],
        },
        runId: 'run-import-004',
        snapshotId: 'snap-0001',
      });

      expect(result.proposals.map((item) => item.proposal.artifactType)).toEqual(['project-brief']);
      expect(result.isolatedPaths).toEqual(['notes/scraps.md']);
      expect(result.healthReport.issues.some((issue) => issue.code === 'isolated-material-notes/scraps.md')).toBe(true);
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(targetRoot, { recursive: true, force: true });
    }
  });

  test('source changes only flow back through an explicit re-import (acceptance #12)', async () => {
    const sourceRoot = await mkdtemp('/tmp/novel-import-source-');
    const targetRoot = await mkdtemp('/tmp/novel-import-target-');
    await writeFile(join(sourceRoot, 'project-brief.md'), PROJECT_BRIEF_MARKDOWN);

    try {
      const first = await confirmImport({
        sourceRoot,
        targetRoot,
        mapping: { approved: true, summary: 'first import', entries: [projectBriefEntry()] },
        runId: 'run-import-005',
        snapshotId: 'snap-0001',
      });
      expect(first.proposals[0]?.draft.content).toContain('在规则中追求自由');

      // Editing the original directory must NOT flow into canonical automatically —
      // nothing was written to the canonical root.
      await writeFile(join(sourceRoot, 'project-brief.md'), PROJECT_BRIEF_MARKDOWN.replace('测试作品', '重写作品'));
      expect(await missing(join(targetRoot, 'state/book/project-brief.md'))).toBe(true);

      // Explicit re-import (re-scan -> new mapping -> re-confirm) picks up the change.
      const scan = scanDirectory(['project-brief.md']);
      const reimport = await confirmImport({
        sourceRoot,
        targetRoot,
        mapping: approveMapping(createMapping(scan.entries)),
        runId: 'run-import-006',
        snapshotId: 'snap-0001',
      });
      expect(reimport.proposals[0]?.draft.content).toContain('重写作品');
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(targetRoot, { recursive: true, force: true });
    }
  });

  test('rejects unapproved, colliding, and path-traversal mappings before building proposals', async () => {
    const sourceRoot = await mkdtemp('/tmp/novel-import-source-');
    const targetRoot = await mkdtemp('/tmp/novel-import-target-');
    await writeFile(join(sourceRoot, 'one.md'), 'one');
    await writeFile(join(sourceRoot, 'two.md'), 'two');
    const base = { runId: 'run-import-007', snapshotId: 'snap-0001' };
    try {
      await expect(confirmImport({ sourceRoot, targetRoot, mapping: { approved: false, summary: '', entries: [] }, ...base })).rejects.toThrow('approved');
      await expect(confirmImport({
        sourceRoot,
        targetRoot,
        mapping: { approved: true, summary: '', entries: [
          { sourcePath: 'one.md', detectedKind: 'reference', canonicalTarget: '../escape.md', confidence: 1 },
        ] },
        ...base,
      })).rejects.toThrow('must remain inside');
      await expect(confirmImport({
        sourceRoot,
        targetRoot,
        mapping: { approved: true, summary: '', entries: [
          { sourcePath: 'one.md', detectedKind: 'reference', canonicalTarget: 'references/imported/a.md', confidence: 1 },
          { sourcePath: 'two.md', detectedKind: 'reference', canonicalTarget: 'references/imported/a.md', confidence: 1 },
        ] },
        ...base,
      })).rejects.toThrow('duplicate canonical target');
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(targetRoot, { recursive: true, force: true });
    }
  });
});

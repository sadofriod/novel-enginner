import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { confirmImport } from './confirm-import';

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
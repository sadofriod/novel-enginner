import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { readyImportMapping, writeReadyImportSource } from './import-test-fixtures';

import { buildImportProposals } from './build-import-proposals';

describe('buildImportProposals', () => {
  test('builds pending-approval imported proposals with canonical drafts from an approved mapping', async () => {
    const sourceRoot = await mkdtemp('/tmp/novel-import-proposals-');
    await writeReadyImportSource(sourceRoot);
    try {
      const result = await buildImportProposals({
        mapping: readyImportMapping(),
        runId: 'run-import-001',
        snapshotId: 'snap-0001',
        readContent: async (path) => readFile(join(sourceRoot, path), 'utf8'),
      });

      expect(result.items.map((item) => item.proposal.artifactType)).toEqual([
        'project-brief',
        'world-foundation',
        'story-blueprint',
        'volume-outline',
        'chapter-outline',
        'location-update',
      ]);
      for (const item of result.items) {
        expect(item.proposal).toMatchObject({
          status: 'pending-approval',
          intent: 'propose',
          origin: 'imported',
          basedOnCanonicalVersion: 'snap-0001',
          parentRunId: 'run-import-001',
        });
      }
      const chapter = result.items.find((item) => item.proposal.artifactType === 'chapter-outline');
      expect(chapter?.proposal.targetId).toBe('chapter-0001-outline');
      expect(chapter?.draft.relativePath).toBe('state/chapters/chapter-0001-outline.md');
      expect(result.isolatedPaths).toEqual([]);
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });

  test('isolates entries with unresolvable target ids instead of proposing them', async () => {
    const result = await buildImportProposals({
      mapping: {
        approved: true,
        summary: 'confirmed',
        entries: [
          { sourcePath: 'notes/reference.md', detectedKind: 'reference', canonicalTarget: 'references/imported/reference.md', confidence: 0.2 },
        ],
      },
      runId: 'run-import-002',
      snapshotId: 'snap-0001',
      readContent: async () => '# notes\n',
    });

    expect(result.items).toEqual([]);
    expect(result.isolatedPaths).toEqual(['notes/reference.md']);
  });
});

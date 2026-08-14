import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { commitCanonicalFile } from './canonical-commit';

describe('canonical commit', () => {
  test('writes a canonical file atomically when workspace and snapshot are valid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-enginner-commit-'));
    const result = await commitCanonicalFile({
      workspaceRoot: root,
      relativePath: 'state/book/book.md',
      content: '---\nid: book-001\n---\n',
      workspaceValidity: 'clean',
      proposalSnapshotId: 'snap-0001',
      currentSnapshotId: 'snap-0001',
    });

    expect(result.committed).toBe(true);
    expect(await readFile(join(root, 'state/book/book.md'), 'utf8')).toContain('book-001');
  });

  test('blocks dirty workspace and snapshot drift without writing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-enginner-commit-'));
    const dirty = await commitCanonicalFile({
      workspaceRoot: root,
      relativePath: 'state/book/book.md',
      content: 'invalid',
      workspaceValidity: 'dirty',
      proposalSnapshotId: 'snap-0001',
      currentSnapshotId: 'snap-0001',
    });
    const drifted = await commitCanonicalFile({
      workspaceRoot: root,
      relativePath: 'state/book/book.md',
      content: 'invalid',
      workspaceValidity: 'clean',
      proposalSnapshotId: 'snap-0001',
      currentSnapshotId: 'snap-0002',
    });

    expect(dirty.committed).toBe(false);
    expect(drifted.committed).toBe(false);
  });
});
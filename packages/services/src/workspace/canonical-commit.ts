/* eslint-disable complexity */

import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { WorkspaceValidity } from '../domain/values';

import { isCanonicalWorkspacePath } from './layout';

export type CanonicalCommitResult =
  | { readonly committed: true; readonly path: string }
  | { readonly committed: false; readonly reason: string };

export interface CanonicalFileCommitInput {
  readonly relativePath: string;
  readonly content: string;
}

export type CanonicalBundleCommitResult =
  | { readonly committed: true; readonly paths: readonly string[] }
  | { readonly committed: false; readonly reason: string };

export async function commitCanonicalBundle(input: {
  readonly workspaceRoot: string;
  readonly files: readonly CanonicalFileCommitInput[];
  readonly workspaceValidity: WorkspaceValidity;
  readonly proposalSnapshotId: string;
  readonly currentSnapshotId: string;
}): Promise<CanonicalBundleCommitResult> {
  if (input.files.length === 0) {
    return { committed: false, reason: 'canonical bundle is empty' };
  }

  const paths = new Set<string>();
  for (const file of input.files) {
    if (paths.has(file.relativePath)) {
      return { committed: false, reason: `duplicate canonical path: ${file.relativePath}` };
    }
    paths.add(file.relativePath);
    const guard = validateCommitTarget({ ...input, relativePath: file.relativePath });
    if (guard !== undefined && 'reason' in guard) {
      return { committed: false, reason: guard.reason };
    }
  }

  const root = resolve(input.workspaceRoot);
  const stagedPaths: Array<{ readonly targetPath: string; readonly stagingPath: string }> = [];
  try {
    for (const file of input.files) {
      const targetPath = resolve(root, file.relativePath);
      const stagingPath = `${targetPath}.${process.pid}.staging`;
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(stagingPath, file.content, 'utf8');
      stagedPaths.push({ targetPath, stagingPath });
    }
  } catch (error: unknown) {
    await Promise.all(stagedPaths.map((staged) => unlink(staged.stagingPath).catch(() => undefined)));
    throw error;
  }
  const backups: Array<{ readonly targetPath: string; readonly backupPath: string }> = [];
  const committedPaths: string[] = [];

  try {
    for (const staged of stagedPaths) {
      const backupPath = `${staged.targetPath}.${process.pid}.backup`;
      try {
        await rename(staged.targetPath, backupPath);
        backups.push({ targetPath: staged.targetPath, backupPath });
      } catch (error: unknown) {
        if (!isMissingFile(error)) {
          throw error;
        }
      }
      await rename(staged.stagingPath, staged.targetPath);
      committedPaths.push(staged.targetPath);
    }
  } catch (error: unknown) {
    await Promise.all(stagedPaths.map((staged) => unlink(staged.stagingPath).catch(() => undefined)));
    await Promise.all(committedPaths.map((path) => unlink(path).catch(() => undefined)));
    await Promise.all(backups.map((backup) => rename(backup.backupPath, backup.targetPath).catch(() => undefined)));
    throw error;
  }

  await Promise.all(backups.map((backup) => unlink(backup.backupPath).catch(() => undefined)));
  return { committed: true, paths: committedPaths };
}

export async function commitCanonicalFile(input: {
  readonly workspaceRoot: string;
  readonly relativePath: string;
  readonly content: string;
  readonly workspaceValidity: WorkspaceValidity;
  readonly proposalSnapshotId: string;
  readonly currentSnapshotId: string;
}): Promise<CanonicalCommitResult> {
  const result = await commitCanonicalBundle({
    ...input,
    files: [{ relativePath: input.relativePath, content: input.content }],
  });
  return result.committed
    ? { committed: true, path: result.paths[0] as string }
    : result;
}

function isMissingFile(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

function validateCommitTarget(input: {
  readonly workspaceValidity: WorkspaceValidity;
  readonly proposalSnapshotId: string;
  readonly currentSnapshotId: string;
  readonly relativePath: string;
}): CanonicalCommitResult | undefined {
  if (input.workspaceValidity !== 'clean') {
    return { committed: false, reason: `workspace is ${input.workspaceValidity}` };
  }
  if (input.proposalSnapshotId !== input.currentSnapshotId) {
    return { committed: false, reason: 'canonical snapshot drifted' };
  }
  if (!isCanonicalWorkspacePath(input.relativePath)) {
    return { committed: false, reason: 'target path is not canonical' };
  }
  return undefined;
}
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { WorkspaceValidity } from '../domain/values';

import { isCanonicalWorkspacePath } from './layout';

export type CanonicalCommitResult =
  | { readonly committed: true; readonly path: string }
  | { readonly committed: false; readonly reason: string };

export async function commitCanonicalFile(input: {
  readonly workspaceRoot: string;
  readonly relativePath: string;
  readonly content: string;
  readonly workspaceValidity: WorkspaceValidity;
  readonly proposalSnapshotId: string;
  readonly currentSnapshotId: string;
}): Promise<CanonicalCommitResult> {
  if (input.workspaceValidity !== 'clean') {
    return { committed: false, reason: `workspace is ${input.workspaceValidity}` };
  }
  if (input.proposalSnapshotId !== input.currentSnapshotId) {
    return { committed: false, reason: 'canonical snapshot drifted' };
  }
  if (!isCanonicalWorkspacePath(input.relativePath)) {
    return { committed: false, reason: 'target path is not canonical' };
  }

  const root = resolve(input.workspaceRoot);
  const targetPath = resolve(root, input.relativePath);
  if (!targetPath.startsWith(`${root}/`)) {
    return { committed: false, reason: 'target path escapes workspace root' };
  }

  const directory = dirname(targetPath);
  const temporaryPath = join(directory, `.${input.relativePath.split('/').at(-1)}.${process.pid}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, input.content, 'utf8');
    await rename(temporaryPath, targetPath);
  } catch (error: unknown) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }

  return { committed: true, path: targetPath };
}
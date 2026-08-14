import { watch, type FSWatcher } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { listCanonicalDirectories, resolveLayoutRuleForPath } from './layout';
import { WorkspaceSyncSession, type WorkspaceSessionState } from './session';
import type { WorkspaceFileInput } from './sync-engine';

export interface WorkspaceFileWatcherOptions {
  readonly workspaceRoot: string;
  readonly session: WorkspaceSyncSession;
  readonly debounceMs?: number;
  readonly syncOnStart?: boolean;
  readonly onSync: (state: WorkspaceSessionState) => void | Promise<void>;
  readonly watchDirectory?: (root: string, onChange: () => void) => { close: () => void };
  readonly readFiles?: (root: string) => Promise<readonly WorkspaceFileInput[]>;
}

export async function readCanonicalWorkspaceFiles(workspaceRoot: string): Promise<readonly WorkspaceFileInput[]> {
  const files: WorkspaceFileInput[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        return;
      }
      const path = relative(workspaceRoot, absolutePath).split(sep).join('/');
      if (resolveLayoutRuleForPath(path) === undefined) {
        return;
      }
      files.push({ path, content: await readFile(absolutePath, 'utf8') });
    }));
  }

  await Promise.all(listCanonicalDirectories().map(async (directory) => {
    try {
      await visit(join(workspaceRoot, directory));
    } catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) {
        throw cause;
      }
    }
  }));
  return files;
}

function defaultWatchDirectory(root: string, onChange: () => void): FSWatcher {
  return watch(root, { recursive: true }, onChange);
}

/** Watches the canonical workspace and coalesces editor save bursts into one sync. */
export function startWorkspaceFileWatcher(options: WorkspaceFileWatcherOptions): { close: () => void } {
  const debounceMs = options.debounceMs ?? 75;
  const watchDirectory = options.watchDirectory ?? defaultWatchDirectory;
  const readFiles = options.readFiles ?? readCanonicalWorkspaceFiles;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const sync = async (): Promise<void> => {
    if (closed) {
      return;
    }
    const state = options.session.applySave(await readFiles(options.workspaceRoot));
    await options.onSync(state);
  };

  const schedule = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      void sync();
    }, debounceMs);
  };

  const watcher = watchDirectory(options.workspaceRoot, schedule);
  if (options.syncOnStart === true) {
    void sync();
  }
  return {
    close: () => {
      closed = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      watcher.close();
    },
  };
}
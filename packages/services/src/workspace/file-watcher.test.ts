import { describe, expect, test } from 'bun:test';

import { WorkspaceSyncSession } from './session';
import { startWorkspaceFileWatcher } from './file-watcher';

const CHARACTER = (name: string) => `---
id: char-watcher
name: ${name}
status: active
coreMotivation: survive
worldview: pragmatic
techLevel: tier-1
---
`;

describe('startWorkspaceFileWatcher', () => {
  test('coalesces save bursts and syncs the latest canonical files once', async () => {
    let onChange: (() => void) | undefined;
    let closeCalls = 0;
    let files = [{ path: 'state/characters/char-watcher.md', content: CHARACTER('初始') }];
    const synced: string[] = [];
    const watcher = startWorkspaceFileWatcher({
      workspaceRoot: '/workspace',
      session: new WorkspaceSyncSession(),
      debounceMs: 5,
      watchDirectory: (_root, callback) => {
        onChange = callback;
        return { close: () => { closeCalls += 1; } };
      },
      readFiles: async () => files,
      onSync: (state) => {
        synced.push(state.snapshot.entities.get('state/characters/char-watcher.md')?.contentHash ?? '');
      },
    });

    files = [{ path: 'state/characters/char-watcher.md', content: CHARACTER('修改后') }];
    onChange?.();
    onChange?.();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(synced).toHaveLength(1);
    expect(synced[0]).not.toBe('');
    watcher.close();
    expect(closeCalls).toBe(1);
  });

  test('does not sync after close', async () => {
    let onChange: (() => void) | undefined;
    let syncCount = 0;
    const watcher = startWorkspaceFileWatcher({
      workspaceRoot: '/workspace',
      session: new WorkspaceSyncSession(),
      debounceMs: 5,
      watchDirectory: (_root, callback) => {
        onChange = callback;
        return { close: () => undefined };
      },
      readFiles: async () => [],
      onSync: () => { syncCount += 1; },
    });

    onChange?.();
    watcher.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(syncCount).toBe(0);
  });
});
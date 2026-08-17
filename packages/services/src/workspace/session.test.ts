import { describe, expect, test } from 'bun:test';

import { WorkspaceSyncSession } from './index';

const VALID_CHARACTER_MARKDOWN = `---
id: char-lin-mo
name: 林默
status: active
coreMotivation: 逃离天鹅座引力阱
worldview: engineering-pragmatist
techLevel: tier-3
---

# Summary

角色当前阶段为技术驱动型求生者。
`;

const INVALID_CHARACTER_MARKDOWN = `---
id: char-lin-mo
name: 林默
status: not-a-real-status
coreMotivation: 逃离天鹅座引力阱
worldview: engineering-pragmatist
techLevel: tier-3
---
`;

describe('WorkspaceSyncSession', () => {
  test('aggregates repeated saves into a single pending synthetic commit', () => {
    const session = new WorkspaceSyncSession();
    session.applySave([{ path: 'state/characters/char-lin-mo.md', content: VALID_CHARACTER_MARKDOWN }]);
    const stateAfterSecondSave = session.applySave([
      { path: 'state/characters/char-lin-mo.md', content: VALID_CHARACTER_MARKDOWN.replace('tier-3', 'tier-4') },
    ]);

    expect(stateAfterSecondSave.pendingCommit?.changedPaths).toEqual(['state/characters/char-lin-mo.md']);

    const commit = session.commitSyntheticSession();
    expect(commit?.changedPaths).toEqual(['state/characters/char-lin-mo.md']);
    expect(session.getState().pendingCommit).toBeUndefined();
  });

  test('refuses to commit while the workspace is invalid', () => {
    const session = new WorkspaceSyncSession();
    session.applySave([{ path: 'state/characters/char-lin-mo.md', content: INVALID_CHARACTER_MARKDOWN }]);
    expect(session.isWriteBlocked()).toBe(true);
    expect(session.commitSyntheticSession()).toBeUndefined();
  });
});

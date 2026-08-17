import { describe, expect, test } from 'bun:test';

import { reSyncState } from './index';

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

# Notes

这里允许记录不参与强校验的人类备注。
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

describe('reSyncState basic flows', () => {
  test('marks workspace clean when nothing changed since last snapshot', () => {
    const files = [{ path: 'state/characters/char-lin-mo.md', content: VALID_CHARACTER_MARKDOWN }];
    const first = reSyncState(files);
    const second = reSyncState(files, first.snapshot);
    expect(first.validity).toBe('dirty');
    expect(second.validity).toBe('clean');
    expect(second.snapshot.snapshotId).toBe(first.snapshot.snapshotId);
  });

  test('marks workspace invalid and preserves last good snapshot on schema failure', () => {
    const files = [{ path: 'state/characters/char-lin-mo.md', content: VALID_CHARACTER_MARKDOWN }];
    const good = reSyncState(files);
    expect(good.validity).toBe('dirty');

    const brokenFiles = [{ path: 'state/characters/char-lin-mo.md', content: INVALID_CHARACTER_MARKDOWN }];
    const broken = reSyncState(brokenFiles, good.snapshot);

    expect(broken.validity).toBe('invalid');
    expect(broken.errors).toHaveLength(1);
    expect(broken.snapshot.entities.get('state/characters/char-lin-mo.md')?.data).toEqual(
      good.snapshot.entities.get('state/characters/char-lin-mo.md')?.data,
    );
  });

  test('ignores paths outside the canonical layout', () => {
    const result = reSyncState([{ path: 'runtime/cache/foo.json', content: '{}' }]);
    expect(result.validity).toBe('clean');
    expect(result.snapshot.entities.size).toBe(0);
  });

  test('marks unknown canonical references invalid and preserves the last good entity', () => {
    const validCharacter = VALID_CHARACTER_MARKDOWN.replace('techLevel: tier-3', 'techLevel: tier-3\nrelationshipIds:\n  - rel-missing');
    const result = reSyncState([{ path: 'state/characters/char-lin-mo.md', content: validCharacter }]);

    expect(result.validity).toBe('invalid');
    expect(result.errors[0]?.reason).toContain('rel-missing');
    expect(result.snapshot.entities.size).toBe(0);
  });
});

import { describe, expect, test } from 'bun:test';

import {
  guardCommandAgainstWorkspaceValidity,
  parseCanonicalMarkdown,
  reSyncState,
  serializeCanonicalMarkdown,
  WorkspaceSyncSession,
} from './index';

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

describe('canonical markdown round-trip', () => {
  test('parses frontmatter and body sections', () => {
    const parsed = parseCanonicalMarkdown(VALID_CHARACTER_MARKDOWN);
    expect((parsed.frontmatter as { id: string }).id).toBe('char-lin-mo');
    expect(parsed.sections.get('Summary')).toContain('技术驱动型求生者');
    expect(parsed.sections.get('Notes')).toContain('人类备注');
  });

  test('serializes back to a parseable document preserving frontmatter fields', () => {
    const parsed = parseCanonicalMarkdown(VALID_CHARACTER_MARKDOWN);
    const serialized = serializeCanonicalMarkdown({
      frontmatter: parsed.frontmatter,
      sections: parsed.sections,
    });
    const reparsed = parseCanonicalMarkdown(serialized);
    expect(reparsed.frontmatter).toEqual(parsed.frontmatter);
    expect(reparsed.sections.get('Summary')).toBe(parsed.sections.get('Summary'));
  });

  test('parses scene heading anchors distinctly from regular sections', () => {
    const doc = `---\nid: chapter-0042\nchapterNumber: 42\nvolumeId: volume-001\nbasedOnOutlineId: chapter-0042-outline\nstatus: approved\nbasedOnCanonicalVersion: snap-001\nsceneAnchorIds:\n  - scene-0042-lab-entry\n---\n\n# Scene scene-0042-lab-entry\n\n林默贴着残损实验室外墙向前摸进。\n`;
    const parsed = parseCanonicalMarkdown(doc);
    expect(parsed.scenes.get('scene-0042-lab-entry')).toContain('林默');
    expect(parsed.sections.size).toBe(0);
  });

  test('rejects markdown without a closed frontmatter block', () => {
    expect(() => parseCanonicalMarkdown('no frontmatter here')).toThrow();
  });
});

describe('reSyncState', () => {
  test('marks workspace clean when nothing changed since last snapshot', () => {
    const files = [{ path: 'state/characters/char-lin-mo.md', content: VALID_CHARACTER_MARKDOWN }];
    const first = reSyncState(files);
    const second = reSyncState(files, first.snapshot);
    expect(first.validity).toBe('dirty');
    expect(second.validity).toBe('clean');
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

  test('accepts planning anchors owned by a book or volume', () => {
    const book = `---
id: book-test
title: Test Book
status: active
activeVolumeId: volume-001
latestCanonicalVersion: snap-0001
globalPromises: [pa-promise]
globalConstraints: []
defaultChapterTypePolicy:
  maxConsecutiveSamePrimaryType: 2
---
`;
    const volume = `---
id: volume-001
title: Test Volume
status: active
sequenceNumber: 1
goal: Test goal
stage: escalation
chapterRoster: []
targetChapterCount: 1
requiredCluePayoffs: []
milestones: []
---
`;
    const anchor = `---
id: pa-promise
kind: promise
title: Test promise
status: active
ownerRef: book-test
summary: A test promise
relatedClueIds: []
targetChapterIds: []
---
`;

    const result = reSyncState([
      { path: 'state/book/book.md', content: book },
      { path: 'state/volumes/volume-001.md', content: volume },
      { path: 'state/planning-anchors/pa-promise.md', content: anchor },
    ]);

    expect(result.validity).toBe('dirty');
    expect(result.errors).toEqual([]);
  });
});

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

describe('guardCommandAgainstWorkspaceValidity', () => {
  test('blocks write-related intents while dirty or invalid', () => {
    expect(guardCommandAgainstWorkspaceValidity('propose', 'dirty').blocked).toBe(true);
    expect(guardCommandAgainstWorkspaceValidity('approve', 'invalid').blocked).toBe(true);
  });

  test('allows write-related intents when the workspace is clean', () => {
    expect(guardCommandAgainstWorkspaceValidity('propose', 'clean').blocked).toBe(false);
  });

  test('never blocks re-sync-state itself', () => {
    expect(guardCommandAgainstWorkspaceValidity('re-sync-state', 'invalid').blocked).toBe(false);
  });
});

import { describe, expect, test } from 'bun:test';

import { buildWorkspaceTree } from './content';

import type { WorkspaceFileInput } from './sync-engine';

const VOLUME = `---
id: volume-001
title: 第一卷 潮汐
sequenceNumber: 1
status: approved
goal: 建立核心冲突
stage: drafting
chapterRoster:
  - chapter-0001-outline
targetChapterCount: 2
requiredCluePayoffs: []
milestones: []
---

# Volume Outline

潮汐卷大纲正文。
`;

const CHAPTER = `---
id: chapter-0001-outline
chapterNumber: 1
volumeId: volume-001
chapterType: reveal
chapterTypeTags:
  - reveal
status: draft
displayTitle: The Clock at 03:17
targetWordCount: 1800
sceneSkeleton:
  - id: scene-clock
    purpose: Mira discovers the stopped clock.
  - id: scene-lighthouse
    purpose: Mira enters the restricted archive.
emotionCurveStageIds:
  - emotion-001
  - emotion-002
  - emotion-003
  - emotion-004
emotionCurve: []
---

# Chapter Outline

细纲正文。
`;

const MANUSCRIPT = `---
id: chapter-0001-manuscript
chapterNumber: 1
volumeId: volume-001
basedOnOutlineId: chapter-0001-outline
status: draft
displayTitle: The Clock at 03:17
basedOnCanonicalVersion: snap-0001
sceneAnchorIds:
  - scene-clock
  - scene-lighthouse
---

# Scene scene-clock

Mira found the harbor clock stopped at 03:17.

# Scene scene-lighthouse

Beneath the lantern, Mira found a soot mark shaped like a date.
`;

const CHARACTER = `---
id: char-mira
name: Mira
status: active
---

# Character

Mira 是灯塔守望者。
`;

const PLANNING_ANCHOR = `---
id: pa-first-tide
title: 第一次涨潮
status: active
---

# Planning Anchor

规划锚点正文。
`;

const FILES: readonly WorkspaceFileInput[] = [
  { path: 'state/volumes/volume-001.md', content: VOLUME },
  { path: 'state/chapters/chapter-0001-outline.md', content: CHAPTER },
  { path: 'manuscript/volume-001/chapter-0001.md', content: MANUSCRIPT },
  { path: 'state/characters/char-mira.md', content: CHARACTER },
  { path: 'state/planning-anchors/pa-first-tide.md', content: PLANNING_ANCHOR },
];

describe('buildWorkspaceTree', () => {
  test('groups chapter outlines under their volume and links manuscripts', () => {
    const tree = buildWorkspaceTree(FILES);

    expect(tree.volumes).toHaveLength(1);
    const volume = tree.volumes[0] as (typeof tree.volumes)[number];
    expect(volume.id).toBe('volume-001');
    expect(volume.label).toBe('第一卷 潮汐');
    expect(volume.sequenceNumber).toBe(1);

    const chapter = volume.chapters[0] as (typeof volume.chapters)[number];
    expect(chapter.id).toBe('chapter-0001-outline');
    expect(chapter.chapterNumber).toBe(1);
    expect(chapter.label).toBe('The Clock at 03:17');
    expect(chapter.scenes).toEqual([
      { id: 'scene-clock', purpose: 'Mira discovers the stopped clock.' },
      { id: 'scene-lighthouse', purpose: 'Mira enters the restricted archive.' },
    ]);
    expect(chapter.manuscriptId).toBe('chapter-0001-manuscript');
  });

  test('groups narrative entities by kind', () => {
    const tree = buildWorkspaceTree(FILES);

    const characters = tree.entityGroups.find((group) => group.group === 'characters');
    expect(characters?.entities).toHaveLength(1);
    expect(characters?.entities[0]?.id).toBe('char-mira');
    expect(characters?.entities[0]?.label).toBe('Mira');
  });

  test('collects planning anchors separately', () => {
    const tree = buildWorkspaceTree(FILES);

    expect(tree.planningAnchors.map((anchor) => anchor.id)).toEqual(['pa-first-tide']);
    expect(tree.planningAnchors[0]?.label).toBe('第一次涨潮');
  });

  test('ignores files outside the canonical layout', () => {
    const tree = buildWorkspaceTree([
      ...FILES,
      { path: 'runtime/cache/foo.json', content: '{}' },
      { path: 'state/chapters/draft-note.md', content: CHAPTER },
    ]);

    expect(tree.volumes).toHaveLength(1);
    expect(tree.unclassified).toHaveLength(0);
  });
});

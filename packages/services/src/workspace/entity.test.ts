import { describe, expect, test } from 'bun:test';

import { getWorkspaceEntity } from './entity';

import type { WorkspaceFileInput } from './sync-engine';

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

const CAPABILITY_REGISTRY = `---
capabilities:
  - id: cloakbrowser
    type: mcp
    enabled: true
    visibility: restricted
    allowedAgents:
      - world-builder
    applicableArtifactTypes: []
---

# Capability Registry

The canonical authority for capability enablement.
`;

const FILES: readonly WorkspaceFileInput[] = [
  { path: 'state/chapters/chapter-0001-outline.md', content: CHAPTER },
  { path: 'manuscript/volume-001/chapter-0001.md', content: MANUSCRIPT },
  { path: 'state/capabilities/registry.md', content: CAPABILITY_REGISTRY },
];

describe('getWorkspaceEntity', () => {
  test('returns parsed entity detail for a chapter outline', () => {
    const entity = getWorkspaceEntity(FILES, 'chapter-outline', 'chapter-0001-outline');

    expect(entity).toBeDefined();
    expect(entity?.path).toBe('state/chapters/chapter-0001-outline.md');
    expect(entity?.frontmatter['chapterNumber']).toBe(1);
    expect(entity?.sections['Chapter Outline']).toBe('细纲正文。');
    expect(entity?.scenes).toEqual({});
  });

  test('returns scene prose for a manuscript', () => {
    const entity = getWorkspaceEntity(FILES, 'chapter-manuscript', 'chapter-0001-manuscript');

    expect(entity?.scenes['scene-clock']).toContain('Mira found');
    expect(entity?.sections).toEqual({});
  });

  test('returns undefined when the entity does not exist', () => {
    expect(getWorkspaceEntity(FILES, 'character', 'char-ghost')).toBeUndefined();
  });

  test('returns undefined when the kind does not match the entity', () => {
    expect(getWorkspaceEntity(FILES, 'character', 'chapter-0001-outline')).toBeUndefined();
  });

  test('falls back to the file name stem when frontmatter has no id', () => {
    const entity = getWorkspaceEntity(FILES, 'capability-registry', 'registry');

    expect(entity).toBeDefined();
    expect(entity?.path).toBe('state/capabilities/registry.md');
    expect(entity?.frontmatter['capabilities']).toBeInstanceOf(Array);
  });
});

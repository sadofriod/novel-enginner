import { describe, expect, test } from 'bun:test';

import { createApiServer } from './api-server';

import type { WorkspaceFileInput } from '../workspace/sync-engine';

const FILES: readonly WorkspaceFileInput[] = [
  {
    path: 'state/volumes/volume-001.md',
    content: `---
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
`,
  },
  {
    path: 'state/chapters/chapter-0001-outline.md',
    content: `---
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
emotionCurveStageIds:
  - emotion-001
  - emotion-002
  - emotion-003
  - emotion-004
emotionCurve: []
---

# Chapter Outline

细纲正文。
`,
  },
  {
    path: 'state/characters/char-mira.md',
    content: `---
id: char-mira
name: Mira
status: active
---

# Character

Mira 是灯塔守望者。
`,
  },
];

function createTestServer() {
  return createApiServer({
    workspaceRoot: 'fake-root',
    readCanonicalFiles: async () => FILES,
  });
}

describe('workspace content endpoints', () => {
  test('GET /workspace/tree returns the grouped content tree', async () => {
    const { fetch } = createTestServer();

    const response = await fetch(new Request('http://local.test/workspace/tree'));

    expect(response.status).toBe(200);
    const tree = await response.json() as {
      readonly volumes: readonly { readonly id: string; readonly chapters: readonly unknown[] }[];
      readonly entityGroups: readonly { readonly group: string; readonly entities: readonly unknown[] }[];
    };
    expect(tree.volumes[0]?.id).toBe('volume-001');
    expect(tree.volumes[0]?.chapters[0]).toMatchObject({ id: 'chapter-0001-outline', chapterNumber: 1 });
    expect(tree.entityGroups.find((group) => group.group === 'characters')?.entities).toHaveLength(1);
  });

  test('GET /workspace/entity/:kind/:id returns the parsed entity', async () => {
    const { fetch } = createTestServer();

    const response = await fetch(new Request('http://local.test/workspace/entity/character/char-mira'));

    expect(response.status).toBe(200);
    const entity = await response.json() as {
      readonly kind: string;
      readonly id: string;
      readonly frontmatter: Record<string, unknown>;
      readonly sections: Record<string, string>;
    };
    expect(entity.kind).toBe('character');
    expect(entity.frontmatter['name']).toBe('Mira');
    expect(entity.sections['Character']).toContain('Mira 是灯塔守望者');
  });

  test('GET /workspace/entity rejects an unknown kind', async () => {
    const { fetch } = createTestServer();

    const response = await fetch(new Request('http://local.test/workspace/entity/unknown-kind/foo'));

    expect(response.status).toBe(400);
  });

  test('GET /workspace/entity returns 404 for a missing entity', async () => {
    const { fetch } = createTestServer();

    const response = await fetch(new Request('http://local.test/workspace/entity/character/char-ghost'));

    expect(response.status).toBe(404);
  });
});

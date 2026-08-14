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

  test('accepts the bootstrap canonical documents and resolves their cross references', () => {
    const projectBrief = `---
id: project-brief-001
bookId: book-test
title: Test Project Brief
genres:
  - 科幻
targetAudience: 本地读者
marketScope: 本地首发
readerPromise: 每章都有推进
corePremise: 一次错误的修复引发更大的真相
openingHook: 火星遗迹中的异常信号
contentBoundaries: []
format: serial
sourceResearchEvidenceIds: []
assumptionIds: []
status: approved
---
`;
    const worldFoundation = `---
id: world-foundation-001
bookId: book-test
eraAndPrimarySetting: 近未来火星基地
realityMode: hard-sf
tone: 克制
capabilitySystem: 工程约束驱动
immutableRules: []
socialOrder: 多阵营竞争
narrativeProhibitions: []
terminologyRefs: []
projectBriefRef: project-brief-001
status: approved
---
`;
    const storyBlueprint = `---
id: story-blueprint-001
bookId: book-test
projectBriefRef: project-brief-001
worldFoundationRef: world-foundation-001
protagonistArc: 从逃离到承担
centralConflict: 真相与生存的对抗
opposition: 掌控资源的势力
resolutionDirection: 用代价换取答案
volumePlan: []
crossVolumeCommitments: []
estimatedVolumeCount: 3
status: approved
---
`;

    const result = reSyncState([
      { path: 'state/book/project-brief.md', content: projectBrief },
      { path: 'state/world/world-foundation.md', content: worldFoundation },
      { path: 'state/book/story-blueprint.md', content: storyBlueprint },
    ]);

    expect(result.validity).toBe('dirty');
    expect(result.errors).toEqual([]);
    expect(result.snapshot.entities.get('state/book/project-brief.md')?.kind).toBe('project-brief');
    expect(result.snapshot.entities.get('state/world/world-foundation.md')?.kind).toBe('world-foundation');
    expect(result.snapshot.entities.get('state/book/story-blueprint.md')?.kind).toBe('story-blueprint');
  });

  test('rejects chapter manuscript displayTitle drift against the approved outline', () => {
    const book = `---
id: book-test
title: Test Book
status: active
activeVolumeId: volume-001
latestCanonicalVersion: snap-0001
globalPromises: []
globalConstraints: []
defaultChapterTypePolicy:
  maxConsecutiveSamePrimaryType: 2
---
`;
    const character = `---
id: char-lin-mo
name: 林默
status: active
coreMotivation: 逃离天鹅座引力阱
worldview: engineering-pragmatist
techLevel: tier-3
---
`;
    const location = `---
id: location-mars-ruins
name: 火星遗迹
status: active
type: ruins
hazards: []
accessRules: []
---
`;
    const volume = `---
id: volume-001
title: Test Volume
status: active
sequenceNumber: 1
goal: Test goal
stage: escalation
chapterRoster:
  - chapter-0042
targetChapterCount: 1
requiredCluePayoffs: []
milestones: []
---
`;
    const outline = `---
id: chapter-0042-outline
chapterNumber: 42
volumeId: volume-001
chapterType: reveal
chapterTypeTags: []
status: approved
displayTitle: 火星遗迹的错误答案
targetWordCount: 3200
sceneSkeleton:
  - id: scene-0042-lab-entry
    purpose: intrusion
    locationId: location-mars-ruins
    participantCharacterIds:
      - char-lin-mo
emotionCurveStageIds:
  - ec-0042-rise
  - ec-0042-pressure
  - ec-0042-counter
  - ec-0042-reveal
---
`;
    const manuscript = `---
id: chapter-0042
chapterNumber: 42
volumeId: volume-001
basedOnOutlineId: chapter-0042-outline
status: approved
displayTitle: 火星遗迹的错误答案（修订版）
basedOnCanonicalVersion: snap-book-001-20260812-01
sceneAnchorIds:
  - scene-0042-lab-entry
---

# Scene scene-0042-lab-entry

林默贴着残损实验室外墙向前摸进。
`;

    const result = reSyncState([
      { path: 'state/book/book.md', content: book },
      { path: 'state/characters/char-lin-mo.md', content: character },
      { path: 'state/locations/location-mars-ruins.md', content: location },
      { path: 'state/volumes/volume-001.md', content: volume },
      { path: 'state/chapters/chapter-0042-outline.md', content: outline },
      { path: 'manuscript/volume-001/chapter-0042.md', content: manuscript },
    ]);

    expect(result.validity).toBe('invalid');
    expect(result.errors.some((error) => error.reason.includes('displayTitle must match'))).toBe(true);
  });

  test('accepts the canonical capability registry as a recognized workspace artifact', () => {
    const registry = `---
capabilities:
  - id: cloakbrowser
    type: mcp
    enabled: true
    visibility: restricted
    allowedAgents:
      - world-builder
      - plot-planner
      - reviewer
    applicableArtifactTypes: []
---

# Capability Registry

This file is the canonical authority for capability enablement.
`;

    const result = reSyncState([{ path: 'state/capabilities/registry.md', content: registry }]);

    expect(result.validity).toBe('dirty');
    expect(result.errors).toEqual([]);
    expect(result.snapshot.entities.get('state/capabilities/registry.md')?.kind).toBe('capability-registry');
    expect((result.snapshot.entities.get('state/capabilities/registry.md')?.data as { capabilities: unknown[] }).capabilities).toHaveLength(1);
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

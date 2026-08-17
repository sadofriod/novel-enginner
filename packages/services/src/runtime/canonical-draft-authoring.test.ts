import { describe, expect, test } from 'bun:test';

import { serializeCanonicalMarkdown } from '../workspace/markdown';
import { validateCanonicalFile } from '../workspace/sync-engine';

import { CanonicalDraftValidationError, createArtifactDraftFromContent, resolveCanonicalPathForArtifact } from './canonical-draft';

function markdown(frontmatter: Record<string, unknown>): string {
  return serializeCanonicalMarkdown({ frontmatter, sections: { 内容: '正文内容。' } });
}

const CHARACTER_FRONTMATTER = {
  id: 'char-mira',
  name: 'Mira',
  status: 'active',
  coreMotivation: '寻找真相',
  worldview: '规则是为了被挑战',
  techLevel: '低科技',
};

describe('resolveCanonicalPathForArtifact', () => {
  test('resolves single-file canonical paths for every authorable artifact type', () => {
    expect(resolveCanonicalPathForArtifact('project-brief', 'project-brief-1')).toBe('state/book/project-brief.md');
    expect(resolveCanonicalPathForArtifact('world-foundation', 'world-foundation-1')).toBe('state/world/world-foundation.md');
    expect(resolveCanonicalPathForArtifact('story-blueprint', 'story-blueprint-1')).toBe('state/book/story-blueprint.md');
    expect(resolveCanonicalPathForArtifact('volume-outline', 'volume-001')).toBe('state/volumes/volume-001.md');
    expect(resolveCanonicalPathForArtifact('chapter-outline', 'chapter-0001-outline')).toBe('state/chapters/chapter-0001-outline.md');
    expect(resolveCanonicalPathForArtifact('character-update', 'char-mira')).toBe('state/characters/char-mira.md');
    expect(resolveCanonicalPathForArtifact('location-update', 'location-harbor')).toBe('state/locations/location-harbor.md');
    expect(resolveCanonicalPathForArtifact('faction-update', 'faction-wardens')).toBe('state/factions/faction-wardens.md');
    expect(resolveCanonicalPathForArtifact('tech-rule-update', 'tech-tide-clock')).toBe('state/tech-rules/tech-tide-clock.md');
    expect(resolveCanonicalPathForArtifact('fact-update', 'fact-tide-lock')).toBe('state/facts/fact-tide-lock.md');
    expect(resolveCanonicalPathForArtifact('relationship-update', 'rel-mira-warden')).toBe('state/relationships/rel-mira-warden.md');
    expect(resolveCanonicalPathForArtifact('resource-update', 'res-brass-key')).toBe('state/resources/res-brass-key.md');
  });
});

describe('createArtifactDraftFromContent', () => {
  test('creates and validates a character draft from author content', () => {
    const draft = createArtifactDraftFromContent({
      proposalId: 'proposal-char-1',
      artifactType: 'character-update',
      targetId: 'char-mira',
      content: markdown(CHARACTER_FRONTMATTER),
    });

    expect(draft.relativePath).toBe('state/characters/char-mira.md');
    const entity = validateCanonicalFile({ path: draft.relativePath, content: draft.content });
    expect(entity.kind).toBe('character');
  });

  test('creates and validates a project-brief draft at its bootstrap path', () => {
    const draft = createArtifactDraftFromContent({
      proposalId: 'proposal-brief-1',
      artifactType: 'project-brief',
      targetId: 'project-brief-1',
      content: markdown({
        id: 'project-brief-1',
        bookId: 'book-1',
        title: '测试作品',
        genres: ['科幻'],
        targetAudience: '青年读者',
        marketScope: '中文网络连载市场',
        readerPromise: '持续紧张感',
        corePremise: '在规则中追求自由',
        openingHook: '开场事件',
        contentBoundaries: [],
        format: '连载长篇',
        sourceResearchEvidenceIds: [],
        assumptionIds: [],
        status: 'draft',
      }),
    });

    expect(draft.relativePath).toBe('state/book/project-brief.md');
    expect(validateCanonicalFile({ path: draft.relativePath, content: draft.content }).kind).toBe('project-brief');
  });

  test('creates a chapter-outline draft at its entity path', () => {
    const draft = createArtifactDraftFromContent({
      proposalId: 'proposal-chapter-1',
      artifactType: 'chapter-outline',
      targetId: 'chapter-0001-outline',
      content: markdown({
        id: 'chapter-0001-outline',
        chapterNumber: 1,
        volumeId: 'volume-001',
        chapterType: 'progress',
        chapterTypeTags: [],
        status: 'draft',
        targetWordCount: 4000,
        sceneSkeleton: [
          { id: 'scene-0001', purpose: '引入冲突', locationId: 'location-harbor', participantCharacterIds: [] },
        ],
        emotionCurveStageIds: ['emotion-1', 'emotion-2', 'emotion-3', 'emotion-4'],
      }),
    });

    expect(draft.relativePath).toBe('state/chapters/chapter-0001-outline.md');
    expect(validateCanonicalFile({ path: draft.relativePath, content: draft.content }).kind).toBe('chapter-outline');
  });

  test('rejects world-change as a single-file author draft', () => {
    expect(() => createArtifactDraftFromContent({
      proposalId: 'proposal-change-1',
      artifactType: 'world-change',
      targetId: 'world-change-1',
      content: '---\nid: world-change-1\n---\n',
    })).toThrow(CanonicalDraftValidationError);
  });
});

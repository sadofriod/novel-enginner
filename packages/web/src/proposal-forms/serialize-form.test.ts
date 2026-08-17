import { describe, expect, test } from 'bun:test';

import { ARTIFACT_FORM_SPECS } from './artifact-form-specs';
import { serializeFormValues } from './serialize-form';

describe('serializeFormValues', () => {
  test('builds a character frontmatter with id and default status from a dedicated form', () => {
    const spec = ARTIFACT_FORM_SPECS['character-update'];
    const serialized = serializeFormValues(
      spec,
      { name: 'Mira', coreMotivation: '寻找真相', worldview: '规则是为了被挑战', techLevel: '低科技', status: 'active' },
      'char-mira',
      '米拉在海港醒来。',
    );

    expect(serialized.frontmatter).toMatchObject({
      id: 'char-mira',
      name: 'Mira',
      status: 'active',
      coreMotivation: '寻找真相',
      techLevel: '低科技',
    });
    expect(serialized.sections).toEqual({ 档案: '米拉在海港醒来。' });
  });

  test('parses comma-separated lists and keeps required lists as empty arrays', () => {
    const spec = ARTIFACT_FORM_SPECS['project-brief'];
    const serialized = serializeFormValues(
      spec,
      {
        bookId: 'book-1',
        title: '测试作品',
        genres: '科幻, 太空歌剧',
        targetAudience: '青年读者',
        marketScope: '中文市场',
        readerPromise: '持续紧张感',
        corePremise: '在规则中追求自由',
        openingHook: '开场事件',
        contentBoundaries: '',
        format: '连载长篇',
        status: 'draft',
      },
      'project-brief-1',
      '定位内容。',
    );

    expect(serialized.frontmatter['genres']).toEqual(['科幻', '太空歌剧']);
    expect(serialized.frontmatter['contentBoundaries']).toEqual([]);
    expect(serialized.frontmatter['status']).toBe('draft');
  });

  test('serializes chapter-outline scene skeleton rows', () => {
    const spec = ARTIFACT_FORM_SPECS['chapter-outline'];
    const serialized = serializeFormValues(
      spec,
      {
        chapterNumber: 1,
        volumeId: 'volume-001',
        chapterType: 'progress',
        chapterTypeTags: '',
        targetWordCount: 4000,
        emotionCurveStageIds: 'emotion-1, emotion-2, emotion-3, emotion-4',
        status: 'draft',
        sceneSkeleton: [
          { id: 'scene-0001', purpose: '引入冲突', locationId: 'location-harbor', participantCharacterIds: 'char-mira' },
        ],
      },
      'chapter-0001-outline',
      '细纲正文。',
    );

    expect(serialized.frontmatter['sceneSkeleton']).toEqual([
      { id: 'scene-0001', purpose: '引入冲突', locationId: 'location-harbor', participantCharacterIds: ['char-mira'] },
    ]);
    expect(serialized.frontmatter['emotionCurveStageIds']).toEqual(['emotion-1', 'emotion-2', 'emotion-3', 'emotion-4']);
  });

  test('derives sceneAnchorIds from manuscript scenes', () => {
    const spec = ARTIFACT_FORM_SPECS['chapter-manuscript'];
    const serialized = serializeFormValues(
      spec,
      { chapterNumber: 1, volumeId: 'volume-001', basedOnOutlineId: 'chapter-0001-outline', basedOnCanonicalVersion: 'snap-0001', status: 'draft' },
      'chapter-0001-manuscript',
      '',
      { 'scene-0001': '第一幕。', 'scene-0002': '第二幕。' },
    );

    expect(serialized.frontmatter['sceneAnchorIds']).toEqual(['scene-0001', 'scene-0002']);
    expect(serialized.scenes).toEqual({ 'scene-0001': '第一幕。', 'scene-0002': '第二幕。' });
    expect(serialized.sections).toBeUndefined();
  });
});

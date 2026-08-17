import { describe, expect, test } from 'bun:test';

import {
  ChapterManuscriptSchema,
  ChapterOutlineSchema,
  EmotionCurveStageSchema,
  SceneSkeletonSchema,
} from './chapter';

describe('chapter and scene schemas', () => {
  test('SceneSkeletonSchema requires purpose, location, and participants', () => {
    expect(
      SceneSkeletonSchema.parse({
        id: 'scene-1',
        purpose: '突破终端防御',
        locationId: 'location-9',
        participantCharacterIds: ['char-1'],
      }),
    ).toMatchObject({ id: 'scene-1' });
  });

  test('EmotionCurveStageSchema requires stage type, effects, and scenes', () => {
    expect(
      EmotionCurveStageSchema.parse({
        id: 'stage-1',
        stageType: 'rise',
        emotionIntensity: 3,
        targetReaderEffects: ['anticipation'],
        sceneIds: ['scene-1'],
        summary: '铺垫',
      }),
    ).toMatchObject({ stageType: 'rise' });
    expect(
      EmotionCurveStageSchema.safeParse({
        id: 'stage-1',
        stageType: 'rise',
        emotionIntensity: 3,
        targetReaderEffects: [],
        sceneIds: ['scene-1'],
        summary: '铺垫',
      }).success,
    ).toBe(false);
  });

  test('ChapterOutlineSchema requires a scene skeleton and 4-6 emotion curve stages', () => {
    expect(
      ChapterOutlineSchema.parse({
        id: 'chapter-1',
        chapterNumber: 41,
        volumeId: 'volume-1',
        chapterType: 'action',
        chapterTypeTags: ['action'],
        status: 'draft',
        targetWordCount: 3000,
        sceneSkeleton: [
          {
            id: 'scene-1',
            purpose: '突破',
            locationId: 'location-9',
            participantCharacterIds: [],
          },
        ],
        emotionCurveStageIds: ['s1', 's2', 's3', 's4'],
      }),
    ).toMatchObject({ chapterNumber: 41 });
    expect(
      ChapterOutlineSchema.safeParse({
        id: 'chapter-1',
        chapterNumber: 41,
        volumeId: 'volume-1',
        chapterType: 'action',
        chapterTypeTags: [],
        status: 'draft',
        targetWordCount: 3000,
        sceneSkeleton: [],
        emotionCurveStageIds: ['s1', 's2', 's3'],
      }).success,
    ).toBe(false);
  });

  test('ChapterManuscriptSchema requires the source outline and canonical version', () => {
    expect(
      ChapterManuscriptSchema.parse({
        id: 'manuscript-1',
        chapterNumber: 41,
        volumeId: 'volume-1',
        basedOnOutlineId: 'chapter-1',
        status: 'approved',
        basedOnCanonicalVersion: 'snap-1',
        sceneAnchorIds: ['scene-1'],
      }),
    ).toMatchObject({ basedOnOutlineId: 'chapter-1' });
  });
});

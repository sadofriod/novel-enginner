import { describe, expect, test } from 'bun:test';

import { BookSchema, VolumeSchema } from '../../domain/schemas/canonical';
import { ChapterOutlineSchema } from '../../domain/schemas/chapter';

import { type ProjectBrief, validateProjectBrief } from './canonical-artifacts';
import {
  buildChapterOutline,
  buildDefaultLocation,
  buildStoryBlueprint,
  buildVolumeOutline,
  buildWorldFoundation,
} from './stage-artifacts';

const BRIEF_INPUT = {
  id: 'project-brief-nova-run',
  bookId: 'book-nova-run',
  title: 'Nova Run',
  genres: ['科幻'],
  targetAudience: '青年读者',
  marketScope: '中文网络连载市场',
  readerPromise: '持续紧张感',
  corePremise: '在压迫性规则中追求自我选择',
  openingHook: '开场事件',
  contentBoundaries: [],
  format: '连载长篇',
  sourceResearchEvidenceIds: [],
  assumptionIds: [],
  status: 'approved',
};
const BRIEF: ProjectBrief = validateProjectBrief(BRIEF_INPUT);

describe('bootstrap stage artifact generators', () => {
  test('builds a schema-valid world foundation bound to the approved brief', () => {
    const world = buildWorldFoundation(BRIEF);
    expect(world.bookId).toBe('book-nova-run');
    expect(world.projectBriefRef).toBe('project-brief-nova-run');
    expect(world.status).toBe('draft');
  });

  test('builds a schema-valid story blueprint referencing brief and world', () => {
    const world = buildWorldFoundation(BRIEF);
    const blueprint = buildStoryBlueprint(BRIEF, world);
    expect(blueprint.projectBriefRef).toBe(BRIEF.id);
    expect(blueprint.worldFoundationRef).toBe(world.id);
    expect(blueprint.centralConflict).toBe(BRIEF.corePremise);
  });

  test('builds a schema-valid volume outline with a padded id', () => {
    const volume = buildVolumeOutline(BRIEF, 1);
    expect(VolumeSchema.parse(volume)).toEqual(volume);
    expect(volume.id).toBe('volume-001');
    expect(volume.sequenceNumber).toBe(1);
  });

  test('builds schema-valid chapter outlines bound to a volume', () => {
    const volume = buildVolumeOutline(BRIEF, 1);
    const chapter = buildChapterOutline(BRIEF, volume, 1);
    const parsed = ChapterOutlineSchema.parse(chapter);
    expect(parsed).toEqual(chapter);
    expect(chapter.id).toBe('chapter-0001-outline');
    expect(chapter.volumeId).toBe('volume-001');
    expect(chapter.chapterNumber).toBe(1);
  });

  test('builds a default location the generated scene skeletons can reference', () => {
    const location = buildDefaultLocation();
    expect(location.id).toBe('location-main');
    expect(location.status).toBe('active');
    expect(BookSchema.safeParse(location).success).toBe(false);
  });
});

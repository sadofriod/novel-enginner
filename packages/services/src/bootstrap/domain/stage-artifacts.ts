import type { ProjectBrief, WorldFoundation, StoryBlueprint, Volume } from '../../domain/schema-types';
import type { ChapterOutline, Location } from '../../domain/schema-types';

/**
 * Schema-valid defaults for the new-book bootstrap chain after the project brief is
 * approved (docs/architecture/modules/11-bootstrap-and-onboarding.md §11.3). Each
 * generator returns a draft whose cross-entity references resolve against the
 * artifacts the earlier stages already committed, so the canonical re-sync never
 * flags them as broken.
 */
export function buildWorldFoundation(brief: ProjectBrief): WorldFoundation {
  return {
    id: `world-foundation-${brief.bookId}`,
    bookId: brief.bookId,
    eraAndPrimarySetting: `围绕「${brief.title}」的核心冲突展开的初始时代设定`,
    realityMode: 'fictional',
    tone: 'serious',
    capabilitySystem: 'limited',
    immutableRules: [],
    socialOrder: 'unknown',
    narrativeProhibitions: [],
    terminologyRefs: [],
    projectBriefRef: brief.id,
    status: 'draft',
  };
}

export function buildStoryBlueprint(brief: ProjectBrief, world: WorldFoundation): StoryBlueprint {
  return {
    id: `story-blueprint-${brief.bookId}`,
    bookId: brief.bookId,
    projectBriefRef: brief.id,
    worldFoundationRef: world.id,
    protagonistArc: '主角在核心冲突中完成从被动到主动的转变',
    centralConflict: brief.corePremise,
    opposition: '阻碍主角选择的系统性对立力量',
    resolutionDirection: '朝着明确的终局方向推进',
    volumePlan: ['一卷完本'],
    crossVolumeCommitments: [],
    estimatedVolumeCount: 1,
    status: 'draft',
  };
}

export function buildVolumeOutline(brief: ProjectBrief, sequenceNumber: number): Volume {
  return {
    id: `volume-${sequenceNumber.toString().padStart(3, '0')}`,
    title: `第 ${sequenceNumber} 卷`,
    status: 'planning',
    sequenceNumber,
    goal: `完成第 ${sequenceNumber} 卷主线`,
    stage: 'planning',
    chapterRoster: [],
    targetChapterCount: 3,
    requiredCluePayoffs: [],
    milestones: [],
  };
}

const CHAPTER_TYPES = ['progress', 'reveal', 'turn'] as const;

export function buildChapterOutline(brief: ProjectBrief, volume: Volume, chapterNumber: number): ChapterOutline {
  const sequence = chapterNumber.toString().padStart(4, '0');
  const chapterType = CHAPTER_TYPES[(chapterNumber - 1) % CHAPTER_TYPES.length] ?? 'progress';
  const emotionIds = ['emotion-1', 'emotion-2', 'emotion-3', 'emotion-4'];
  return {
    id: `chapter-${sequence}-outline`,
    chapterNumber,
    volumeId: volume.id,
    chapterType,
    chapterTypeTags: [],
    status: 'draft',
    displayTitle: `第 ${chapterNumber} 章`,
    targetWordCount: 3000,
    activeClueIds: [],
    resolveClueIds: [],
    introduceClueIds: [],
    sceneSkeleton: [
      {
        id: `scene-${sequence}-1`,
        purpose: '推进主线并引入新的压力',
        locationId: 'location-main',
        participantCharacterIds: [],
      },
    ],
    emotionCurveStageIds: emotionIds,
  };
}

/**
 * The default location the generated chapter scene skeletons reference. Committed
 * alongside the first chapter-outline batch so the workspace re-sync stays valid
 * until the author defines real locations.
 */
export function buildDefaultLocation(): Location {
  return {
    id: 'location-main',
    name: '主场景',
    type: 'region',
    hazards: [],
    accessRules: [],
    status: 'active',
  };
}

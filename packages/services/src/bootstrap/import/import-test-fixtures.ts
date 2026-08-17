import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { serializeCanonicalMarkdown } from '../../workspace/markdown';

import type { ImportMapping } from './import-mapper';

export function markdown(frontmatter: Record<string, unknown>): string {
  return serializeCanonicalMarkdown({ frontmatter, sections: { 内容: '正文内容。' } });
}

const READY_FRONTMATTER: Readonly<Record<string, unknown>> = {
  'project-brief': {
    id: 'project-brief-import',
    bookId: 'book-import-test',
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
    status: 'approved',
  },
  'world-foundation': {
    id: 'world-foundation-import',
    bookId: 'book-import-test',
    eraAndPrimarySetting: '星海纪元',
    realityMode: 'hard',
    tone: '冷峻',
    capabilitySystem: '无超能力',
    immutableRules: [],
    socialOrder: '秩序',
    narrativeProhibitions: [],
    terminologyRefs: [],
    projectBriefRef: 'project-brief-import',
    status: 'approved',
  },
  'story-blueprint': {
    id: 'story-blueprint-import',
    bookId: 'book-import-test',
    projectBriefRef: 'project-brief-import',
    worldFoundationRef: 'world-foundation-import',
    protagonistArc: '成长弧线',
    centralConflict: '核心冲突',
    opposition: '对立力量',
    resolutionDirection: '终局方向',
    volumePlan: ['一卷完本'],
    crossVolumeCommitments: [],
    estimatedVolumeCount: 1,
    status: 'approved',
  },
  volume: {
    id: 'volume-001',
    title: '第一卷',
    status: 'active',
    sequenceNumber: 1,
    goal: '完成首卷主线',
    stage: 'planning',
    chapterRoster: ['chapter-0001-outline'],
    targetChapterCount: 1,
    requiredCluePayoffs: [],
    milestones: [],
  },
  chapter: {
    id: 'chapter-0001-outline',
    chapterNumber: 1,
    volumeId: 'volume-001',
    chapterType: 'progress',
    chapterTypeTags: [],
    status: 'approved',
    displayTitle: '第一章',
    targetWordCount: 4000,
    activeClueIds: [],
    resolveClueIds: [],
    introduceClueIds: [],
    sceneSkeleton: [
      { id: 'scene-0001', purpose: '引入冲突', locationId: 'location-harbor', participantCharacterIds: [] },
    ],
    emotionCurveStageIds: ['emotion-rise-1', 'emotion-pressure-1', 'emotion-counter-1', 'emotion-hook-1'],
  },
  location: {
    id: 'location-harbor',
    name: '海港',
    type: 'city',
    hazards: [],
    accessRules: [],
    status: 'active',
  },
};

export interface ReadyImportEntry {
  readonly kind: 'project-brief' | 'world-foundation' | 'story-blueprint' | 'volume' | 'chapter' | 'location';
  readonly sourcePath: string;
  readonly canonicalTarget: string;
}

export const READY_IMPORT_ENTRIES: readonly ReadyImportEntry[] = [
  { kind: 'project-brief', sourcePath: 'project-brief.md', canonicalTarget: 'state/book/project-brief.md' },
  { kind: 'world-foundation', sourcePath: 'world-foundation.md', canonicalTarget: 'state/world/world-foundation.md' },
  { kind: 'story-blueprint', sourcePath: 'story-blueprint.md', canonicalTarget: 'state/book/story-blueprint.md' },
  { kind: 'volume', sourcePath: 'volume-001.md', canonicalTarget: 'state/volumes/volume-001.md' },
  { kind: 'chapter', sourcePath: 'chapter-0001.md', canonicalTarget: 'state/chapters/chapter-0001-outline.md' },
  { kind: 'location', sourcePath: 'location-harbor.md', canonicalTarget: 'state/locations/location-harbor.md' },
];

export function readyImportMapping(): ImportMapping {
  return {
    approved: true,
    summary: 'confirmed',
    entries: READY_IMPORT_ENTRIES.map((entry) => ({
      sourcePath: entry.sourcePath,
      detectedKind: entry.kind,
      canonicalTarget: entry.canonicalTarget,
      confidence: 1,
    })),
  };
}

/** Writes the self-consistent set of source files that makes a complete import ready to write. */
export async function writeReadyImportSource(root: string): Promise<void> {
  for (const entry of READY_IMPORT_ENTRIES) {
    await writeFile(join(root, entry.sourcePath), markdown(READY_FRONTMATTER[entry.kind] as Record<string, unknown>));
  }
}

export function brokenReferenceWorldFoundationFrontmatter(): Record<string, unknown> {
  return {
    ...(READY_FRONTMATTER['world-foundation'] as Record<string, unknown>),
    projectBriefRef: 'project-brief-missing',
  };
}

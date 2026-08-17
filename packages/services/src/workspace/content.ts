/* eslint-disable complexity */
import { resolveLayoutRuleForPath } from './layout';
import { asRecord, fileNameStem, firstNumber, firstString, parseFrontmatter } from './content-parsing';

import type { CanonicalEntityKind } from './layout';
import type { WorkspaceFileInput } from './sync-engine';

export interface ContentTreeNode {
  readonly id: string;
  readonly kind: CanonicalEntityKind;
  readonly path: string;
  readonly label: string;
}

export interface SceneSummary {
  readonly id: string;
  readonly purpose: string;
}

export interface ChapterTreeNode extends ContentTreeNode {
  readonly chapterNumber: number | undefined;
  readonly volumeId: string | undefined;
  readonly scenes: readonly SceneSummary[];
  readonly manuscriptId: string | undefined;
}

export interface VolumeTreeNode extends ContentTreeNode {
  readonly sequenceNumber: number | undefined;
  readonly chapters: readonly ChapterTreeNode[];
}

export const CONTENT_ENTITY_GROUP_VALUES = [
  'characters',
  'factions',
  'locations',
  'facts',
  'plot-clues',
  'relationships',
  'resources',
  'tech-rules',
] as const;

export type ContentEntityGroup = (typeof CONTENT_ENTITY_GROUP_VALUES)[number];

const CONTENT_ENTITY_GROUP_BY_KIND: Readonly<Record<string, ContentEntityGroup>> = {
  character: 'characters',
  faction: 'factions',
  location: 'locations',
  fact: 'facts',
  'plot-clue': 'plot-clues',
  relationship: 'relationships',
  resource: 'resources',
  'tech-rule': 'tech-rules',
};

const BOOK_DOC_KINDS: ReadonlySet<string> = new Set(['book', 'project-brief', 'world-foundation', 'story-blueprint']);

const LABEL_KEYS: readonly string[] = ['displayTitle', 'title', 'name'];

export interface EntityGroupNode {
  readonly group: ContentEntityGroup;
  readonly entities: readonly ContentTreeNode[];
}

export interface WorkspaceTree {
  readonly volumes: readonly VolumeTreeNode[];
  readonly entityGroups: readonly EntityGroupNode[];
  readonly planningAnchors: readonly ContentTreeNode[];
  readonly bookDocs: readonly ContentTreeNode[];
  readonly unclassified: readonly ContentTreeNode[];
}

function parseScenes(frontmatter: Record<string, unknown>): readonly SceneSummary[] {
  if (!Array.isArray(frontmatter['sceneSkeleton'])) {
    return [];
  }
  return frontmatter['sceneSkeleton'].flatMap((scene) => {
    const record = asRecord(scene);
    const id = firstString(record, ['id']);
    if (id === undefined) {
      return [];
    }
    return [{ id, purpose: firstString(record, ['purpose']) ?? '' }];
  });
}

function contentNode(
  file: WorkspaceFileInput,
  kind: CanonicalEntityKind,
  frontmatter: Record<string, unknown>,
): ContentTreeNode {
  return {
    id: firstString(frontmatter, ['id']) ?? fileNameStem(file.path),
    kind,
    path: file.path,
    label: firstString(frontmatter, LABEL_KEYS) ?? fileNameStem(file.path),
  };
}

function volumeNode(file: WorkspaceFileInput, frontmatter: Record<string, unknown>): VolumeTreeNode {
  return {
    ...contentNode(file, 'volume', frontmatter),
    sequenceNumber: firstNumber(frontmatter, ['sequenceNumber']),
    chapters: [],
  };
}

function byLabel(a: ContentTreeNode, b: ContentTreeNode): number {
  return a.label.localeCompare(b.label);
}

export function buildWorkspaceTree(files: readonly WorkspaceFileInput[]): WorkspaceTree {
  const volumes = new Map<string, VolumeTreeNode>();
  const chapters: ChapterTreeNode[] = [];
  const manuscriptByOutline = new Map<string, string>();
  const groupedEntities = new Map<ContentEntityGroup, ContentTreeNode[]>();
  const planningAnchors: ContentTreeNode[] = [];
  const bookDocs: ContentTreeNode[] = [];
  const unclassified: ContentTreeNode[] = [];

  for (const file of files) {
    const rule = resolveLayoutRuleForPath(file.path);
    if (rule === undefined) {
      continue;
    }
    const frontmatter = parseFrontmatter(file);
    const node = contentNode(file, rule.kind, frontmatter);

    if (rule.kind === 'volume') {
      volumes.set(node.id, volumeNode(file, frontmatter));
    } else if (rule.kind === 'chapter-outline') {
      chapters.push(chapterNode(file, frontmatter));
    } else if (rule.kind === 'chapter-manuscript') {
      const outlineId = firstString(frontmatter, ['basedOnOutlineId']);
      if (outlineId !== undefined) {
        manuscriptByOutline.set(outlineId, node.id);
      }
    } else {
      const group = CONTENT_ENTITY_GROUP_BY_KIND[rule.kind];
      if (group !== undefined) {
        const list = groupedEntities.get(group) ?? [];
        list.push(node);
        groupedEntities.set(group, list);
      } else if (rule.kind === 'planning-anchor') {
        planningAnchors.push(node);
      } else if (BOOK_DOC_KINDS.has(rule.kind)) {
        bookDocs.push(node);
      } else {
        unclassified.push(node);
      }
    }
  }

  const chaptersByVolumeId = new Map<string, ChapterTreeNode[]>();
  const unassignedChapters: ChapterTreeNode[] = [];
  for (const chapter of chapters) {
    const chapterWithManuscript = { ...chapter, manuscriptId: manuscriptByOutline.get(chapter.id) };
    const volumeId = chapterWithManuscript.volumeId;
    if (volumeId === undefined || !volumes.has(volumeId)) {
      unassignedChapters.push(chapterWithManuscript);
      continue;
    }
    const list = chaptersByVolumeId.get(volumeId) ?? [];
    list.push(chapterWithManuscript);
    chaptersByVolumeId.set(volumeId, list);
  }

  return {
    volumes: [...volumes.values()].sort(bySequence).map((volume) => ({
      ...volume,
      chapters: [...(chaptersByVolumeId.get(volume.id) ?? [])].sort(byChapterNumber),
    })),
    entityGroups: CONTENT_ENTITY_GROUP_VALUES.map((group) => ({
      group,
      entities: [...(groupedEntities.get(group) ?? [])].sort(byLabel),
    })).filter((group) => group.entities.length > 0),
    planningAnchors: [...planningAnchors].sort(byLabel),
    bookDocs: [...bookDocs].sort(byLabel),
    unclassified: [...unclassified, ...unassignedChapters].sort(byLabel),
  };
}

function chapterNode(file: WorkspaceFileInput, frontmatter: Record<string, unknown>): ChapterTreeNode {
  return {
    ...contentNode(file, 'chapter-outline', frontmatter),
    chapterNumber: firstNumber(frontmatter, ['chapterNumber']),
    volumeId: firstString(frontmatter, ['volumeId']),
    scenes: parseScenes(frontmatter),
    manuscriptId: undefined,
  };
}

function bySequence(a: VolumeTreeNode, b: VolumeTreeNode): number {
  const aSeq = a.sequenceNumber ?? Number.MAX_SAFE_INTEGER;
  const bSeq = b.sequenceNumber ?? Number.MAX_SAFE_INTEGER;
  return aSeq - bSeq;
}

function byChapterNumber(a: ChapterTreeNode, b: ChapterTreeNode): number {
  const aNum = a.chapterNumber ?? Number.MAX_SAFE_INTEGER;
  const bNum = b.chapterNumber ?? Number.MAX_SAFE_INTEGER;
  return aNum - bNum;
}

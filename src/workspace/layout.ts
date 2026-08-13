import type { z } from 'zod';

import {
  BookSchema,
  ChapterManuscriptSchema,
  ChapterOutlineSchema,
  CharacterSchema,
  FactionSchema,
  FactSchema,
  LocationSchema,
  PlanningAnchorSchema,
  PlotClueSchema,
  RelationshipSchema,
  ResourceSchema,
  TechRuleSchema,
  VolumeSchema,
} from '../domain/schema';

export const CANONICAL_ENTITY_KIND_VALUES = [
  'book',
  'volume',
  'chapter-outline',
  'chapter-manuscript',
  'character',
  'fact',
  'relationship',
  'resource',
  'faction',
  'location',
  'tech-rule',
  'plot-clue',
  'planning-anchor',
] as const;

export type CanonicalEntityKind = (typeof CANONICAL_ENTITY_KIND_VALUES)[number];

export interface CanonicalLayoutRule {
  readonly kind: CanonicalEntityKind;
  readonly directory: string;
  readonly filePattern: RegExp;
  readonly schema: z.ZodTypeAny;
}

const kebabIdPattern = '[a-z0-9]+(?:-[a-z0-9]+)*';

export const CANONICAL_LAYOUT_RULES: readonly CanonicalLayoutRule[] = [
  {
    kind: 'book',
    directory: 'state/book',
    filePattern: /^book\.md$/,
    schema: BookSchema,
  },
  {
    kind: 'volume',
    directory: 'state/volumes',
    filePattern: /^volume-\d{3}\.md$/,
    schema: VolumeSchema,
  },
  {
    kind: 'chapter-outline',
    directory: 'state/chapters',
    filePattern: /^chapter-\d{4}-outline\.md$/,
    schema: ChapterOutlineSchema,
  },
  {
    kind: 'chapter-manuscript',
    directory: 'manuscript',
    filePattern: /^chapter-\d{4}\.md$/,
    schema: ChapterManuscriptSchema,
  },
  {
    kind: 'character',
    directory: 'state/characters',
    filePattern: new RegExp(`^char-${kebabIdPattern}\\.md$`),
    schema: CharacterSchema,
  },
  {
    kind: 'fact',
    directory: 'state/facts',
    filePattern: new RegExp(`^fact-${kebabIdPattern}\\.md$`),
    schema: FactSchema,
  },
  {
    kind: 'relationship',
    directory: 'state/relationships',
    filePattern: new RegExp(`^rel-${kebabIdPattern}\\.md$`),
    schema: RelationshipSchema,
  },
  {
    kind: 'resource',
    directory: 'state/resources',
    filePattern: new RegExp(`^res-${kebabIdPattern}\\.md$`),
    schema: ResourceSchema,
  },
  {
    kind: 'faction',
    directory: 'state/factions',
    filePattern: new RegExp(`^faction-${kebabIdPattern}\\.md$`),
    schema: FactionSchema,
  },
  {
    kind: 'location',
    directory: 'state/locations',
    filePattern: new RegExp(`^location-${kebabIdPattern}\\.md$`),
    schema: LocationSchema,
  },
  {
    kind: 'tech-rule',
    directory: 'state/tech-rules',
    filePattern: new RegExp(`^tech-${kebabIdPattern}\\.md$`),
    schema: TechRuleSchema,
  },
  {
    kind: 'plot-clue',
    directory: 'state/plot-clues',
    filePattern: new RegExp(`^clue-${kebabIdPattern}\\.md$`),
    schema: PlotClueSchema,
  },
  {
    kind: 'planning-anchor',
    directory: 'state/planning-anchors',
    filePattern: new RegExp(`^pa-${kebabIdPattern}\\.md$`),
    schema: PlanningAnchorSchema,
  },
];

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Resolves the canonical layout rule that governs a given workspace-relative file
 * path, based on the directory + filename conventions in the architecture docs.
 */
export function resolveLayoutRuleForPath(relativePath: string): CanonicalLayoutRule | undefined {
  const normalized = normalizeRelativePath(relativePath);
  const lastSlash = normalized.lastIndexOf('/');
  const directory = lastSlash === -1 ? '' : normalized.slice(0, lastSlash);
  const fileName = lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);

  return CANONICAL_LAYOUT_RULES.find(
    (rule) => rule.directory === directory && rule.filePattern.test(fileName),
  );
}

export function isCanonicalWorkspacePath(relativePath: string): boolean {
  return resolveLayoutRuleForPath(relativePath) !== undefined;
}

export function listCanonicalDirectories(): readonly string[] {
  return [...new Set(CANONICAL_LAYOUT_RULES.map((rule) => rule.directory))];
}

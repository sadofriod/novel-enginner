import type { SearchResultItem } from '../../api-types';

const SEARCH_KIND_TO_ENTITY: Readonly<Record<string, string>> = {
  Character: 'character',
  Faction: 'faction',
  Location: 'location',
  PlotClue: 'plot-clue',
  PlanningAnchor: 'planning-anchor',
  Chapter: 'chapter-outline',
};

export interface SearchTarget {
  readonly kind: string;
  readonly id: string;
}

/** Maps a semantic-search result back to a canonical entity the tree can open. */
export function resolveSearchTarget(result: SearchResultItem): SearchTarget | undefined {
  const kind = SEARCH_KIND_TO_ENTITY[result.kind];
  if (kind === undefined) {
    return undefined;
  }
  return { kind, id: result.nodeId };
}

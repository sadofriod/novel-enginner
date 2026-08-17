import type { WorkspaceSnapshot } from '../../workspace/sync-engine';
import type { DerivedGraph } from '../types';

import { deriveChapterOutlineGraph } from './chapter-outline';
import { deriveCharacterGraph } from './character';
import { deriveFactionGraph } from './faction';
import { dedupeEdges } from './graph-util';
import { deriveLocationGraph } from './location';
import { derivePlotClueGraph } from './plot-clue';
import { deriveRelationshipGraph } from './relationship';
import { buildSearchDocuments } from './search-documents';
import { deriveTechRuleGraph } from './tech-rule';

/**
 * Rebuilds the derived graph + search scaffold entirely from a canonical
 * WorkspaceSnapshot (src/workspace/sync-engine.ts). This function is pure and
 * deterministic: the same snapshot always yields the same graph, so the graph
 * layer never needs to be treated as a second source of truth (per
 * docs/architecture/modules/08-graph-search-and-capabilities.md §8.1).
 */
export function buildDerivedGraph(snapshot: WorkspaceSnapshot): DerivedGraph {
  const slices = [
    deriveCharacterGraph(snapshot),
    deriveFactionGraph(snapshot),
    deriveLocationGraph(snapshot),
    deriveTechRuleGraph(snapshot),
    derivePlotClueGraph(snapshot),
    deriveChapterOutlineGraph(snapshot),
    deriveRelationshipGraph(snapshot),
  ];

  const nodes = slices.flatMap((slice) => slice.nodes);
  const edges = dedupeEdges(slices.flatMap((slice) => slice.edges));

  return {
    builtFromSnapshotId: snapshot.snapshotId,
    nodes,
    edges,
    searchDocuments: buildSearchDocuments(snapshot, nodes),
  };
}

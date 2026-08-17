import type { GraphNode, GraphEdge } from '../types';
import type { CanonicalEntitySnapshot, WorkspaceSnapshot } from '../../workspace/sync-engine';

/** The pure per-kind output of a graph derivation: nodes and edges for one entity kind. */
export interface EntityGraphSlice {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

export function entitiesOfKind(
  snapshot: WorkspaceSnapshot,
  kind: CanonicalEntitySnapshot['kind'],
): readonly CanonicalEntitySnapshot[] {
  return [...snapshot.entities.values()].filter((entity) => entity.kind === kind);
}

/** Keeps the first occurrence of each edge id while preserving generation order. */
export function dedupeEdges(edges: readonly GraphEdge[]): readonly GraphEdge[] {
  const seen = new Set<string>();
  const result: GraphEdge[] = [];
  for (const edge of edges) {
    if (seen.has(edge.id)) {
      continue;
    }
    seen.add(edge.id);
    result.push(edge);
  }
  return result;
}

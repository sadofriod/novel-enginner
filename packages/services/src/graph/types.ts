import type { CanonicalEntityKind } from '../workspace/layout';

/**
 * Node kinds recognized by the derived graph, per
 * docs/architecture/modules/08-graph-search-and-capabilities.md §8.2.
 */
export const GRAPH_NODE_KIND_VALUES = [
  'Chapter',
  'PlotClue',
  'Character',
  'Faction',
  'Location',
  'TechRule',
  'Scene',
] as const;

export type GraphNodeKind = (typeof GRAPH_NODE_KIND_VALUES)[number];

/**
 * Minimal recommended edge set, per
 * docs/architecture/modules/08-graph-search-and-capabilities.md §8.3.
 * `relates-to` is a fallback used only when a canonical `relationship` record's
 * `relationType` does not map onto one of the recommended edge types, so no
 * relationship data is silently dropped.
 */
export const GRAPH_EDGE_TYPE_VALUES = [
  'introduces',
  'advances',
  'resolves',
  'knows',
  'misunderstands',
  'controls',
  'located-in',
  'depends-on',
  'conflicts-with',
  'uses-tech',
  'relates-to',
] as const;

export type GraphEdgeType = (typeof GRAPH_EDGE_TYPE_VALUES)[number];

export interface GraphNode {
  readonly id: string;
  readonly kind: GraphNodeKind;
  readonly label: string;
  /** Canonical workspace path this node was derived from. */
  readonly sourceRef: string;
  /** Canonical entity kind (from src/workspace/layout.ts) that produced this node. */
  readonly canonicalKind: CanonicalEntityKind;
}

export interface GraphEdge {
  readonly id: string;
  readonly type: GraphEdgeType;
  readonly sourceId: string;
  readonly targetId: string;
  /**
   * Provenance of the edge: which canonical fact/record justified generating it,
   * e.g. a factId for `knows`/`misunderstands`, or a relationship record path.
   */
  readonly provenanceRef?: string;
}

/**
 * A rebuildable search/index document. This intentionally does not carry vector
 * embeddings itself (that is left to an out-of-process embedding job) — it only
 * captures which summary-layer text would be sent for indexing, per
 * docs/architecture/modules/08-graph-search-and-capabilities.md §8.4.
 */
export interface SearchDocument {
  readonly id: string;
  readonly kind: GraphNodeKind;
  readonly nodeId: string;
  readonly sourceRef: string;
  readonly text: string;
  readonly contentHash: string;
}

export interface DerivedGraph {
  readonly builtFromSnapshotId: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly searchDocuments: readonly SearchDocument[];
}

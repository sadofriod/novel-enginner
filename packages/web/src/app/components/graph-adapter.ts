import type { WorkspaceGraph } from '../../api-types';

export interface DerivedGraphView {
  readonly status: 'ready' | 'stale';
  readonly nodes: readonly { readonly id: string; readonly label: string; readonly type: string }[];
  readonly edges: readonly { readonly source: string; readonly target: string; readonly type: string }[];
}

/** Adapts the standalone /graph response into the view shape used by graph components. */
export function toDerivedGraphView(graph: WorkspaceGraph): DerivedGraphView {
  return {
    status: graph.status === 'ready' ? 'ready' : 'stale',
    nodes: graph.nodes.map((node) => ({ id: node.id, label: node.label, type: node.kind })),
    edges: graph.edges.map((edge) => ({ source: edge.sourceId, target: edge.targetId, type: edge.type })),
  };
}

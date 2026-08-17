/**
 * Interactive graph canvas using @xyflow/react.
 * This component uses DOM APIs and React hooks and is rendered only in the SPA.
 *
 * Node types from docs/architecture/modules/08-graph-search-and-capabilities.md §8.2
 * Edge types from §8.3
 */

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { ArtifactDerivedGraph, ArtifactGraphNode, ArtifactGraphEdge } from '@novel-enginner/services/runtime/artifact-detail';

// MUI-aligned colors per node type
const NODE_TYPE_STYLES: Record<string, { background: string; border: string; color: string }> = {
  Chapter:   { background: '#e3f2fd', border: '#1976d2', color: '#0d47a1' },
  PlotClue:  { background: '#f3e5f5', border: '#7b1fa2', color: '#4a148c' },
  Character: { background: '#e8f5e9', border: '#388e3c', color: '#1b5e20' },
  Faction:   { background: '#fff3e0', border: '#f57c00', color: '#e65100' },
  Location:  { background: '#e0f7fa', border: '#0097a7', color: '#006064' },
  TechRule:  { background: '#fce4ec', border: '#c2185b', color: '#880e4f' },
  Scene:     { background: '#f1f8e9', border: '#689f38', color: '#33691e' },
};
const DEFAULT_STYLE = { background: '#f5f5f5', border: '#9e9e9e', color: '#424242' };

const NODE_W = 160;
const NODE_H = 50;

function buildFlowNodes(nodes: readonly ArtifactGraphNode[]): Node[] {
  const count = nodes.length;
  return nodes.map((node, i) => {
    // Circular layout for initial positions
    const radius = Math.max(180, count * 28);
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    const x = 300 + radius * Math.cos(angle) - NODE_W / 2;
    const y = 250 + radius * Math.sin(angle) - NODE_H / 2;
    const style = NODE_TYPE_STYLES[node.type] ?? DEFAULT_STYLE;
    return {
      id: node.id,
      position: { x, y },
      data: { label: buildNodeLabel(node) },
      style: {
        background: style.background,
        border: `1.5px solid ${style.border}`,
        borderRadius: '4px',
        color: style.color,
        fontSize: '12px',
        fontWeight: 600,
        padding: '6px 10px',
        width: NODE_W,
        minHeight: NODE_H,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center' as const,
      },
    };
  });
}

function buildNodeLabel(node: ArtifactGraphNode): React.ReactNode {
  const style = NODE_TYPE_STYLES[node.type] ?? DEFAULT_STYLE;
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: '12px', color: style.color }}>{node.label}</div>
      <div style={{ fontSize: '10px', color: style.border, fontWeight: 400 }}>{node.type}</div>
    </div>
  );
}

function buildFlowEdges(edges: readonly ArtifactGraphEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: `${edge.source}-${edge.target}-${edge.type}`,
    source: edge.source,
    target: edge.target,
    label: edge.type,
    type: 'smoothstep',
    style: { stroke: '#bdbdbd', strokeWidth: 1.5 },
    labelStyle: { fontSize: '10px', fill: '#9e9e9e' },
    labelBgStyle: { fill: '#fff', fillOpacity: 0.85 },
    markerEnd: { type: 'arrowclosed' as const, color: '#bdbdbd' },
  }));
}

export interface GraphCanvasProps {
  readonly graph: ArtifactDerivedGraph;
  readonly height?: number;
}

export function GraphCanvas({ graph, height = 420 }: GraphCanvasProps) {
  const nodes = buildFlowNodes(graph.nodes);
  const edges = buildFlowEdges(graph.edges);

  return (
    <div style={{ width: '100%', height, border: '1px solid #e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={{} as NodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e0e0e0" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(node) => {
            const type = (node.data as { type?: string }).type;
            return type !== undefined ? (NODE_TYPE_STYLES[type]?.border ?? '#9e9e9e') : '#9e9e9e';
          }}
          style={{ border: '1px solid #e0e0e0', borderRadius: '4px' }}
        />
      </ReactFlow>
    </div>
  );
}

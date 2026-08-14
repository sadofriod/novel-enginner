/**
 * Static SVG graph layout — pure math, no DOM APIs.
 * Used by renderToStaticMarkup (server-side) and as a no-JS fallback.
 *
 * Layout: concentric ring — center node (the selected artifact) surrounded by
 * grouped type rings. Edge lines drawn between positions.
 */

import type { ArtifactDerivedGraph, ArtifactGraphNode, ArtifactGraphEdge } from '@novel-enginner/services/runtime/artifact-detail';

export interface StaticGraphViewProps {
  readonly graph: ArtifactDerivedGraph;
  readonly width?: number;
  readonly height?: number;
}

// MUI-aligned node type colors (§8.2 node types)
const NODE_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  Chapter:   { fill: '#e3f2fd', stroke: '#1976d2', text: '#0d47a1' },
  PlotClue:  { fill: '#f3e5f5', stroke: '#7b1fa2', text: '#4a148c' },
  Character: { fill: '#e8f5e9', stroke: '#388e3c', text: '#1b5e20' },
  Faction:   { fill: '#fff3e0', stroke: '#f57c00', text: '#e65100' },
  Location:  { fill: '#e0f7fa', stroke: '#0097a7', text: '#006064' },
  TechRule:  { fill: '#fce4ec', stroke: '#c2185b', text: '#880e4f' },
  Scene:     { fill: '#f1f8e9', stroke: '#689f38', text: '#33691e' },
};
const DEFAULT_NODE_COLOR = { fill: '#f5f5f5', stroke: '#9e9e9e', text: '#424242' };

const NODE_W = 100;
const NODE_H = 36;
const LABEL_MAX = 10;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function layoutNodes(nodes: readonly ArtifactGraphNode[], cx: number, cy: number): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const count = nodes.length;
  if (count === 0) return positions;

  if (count === 1) {
    const first = nodes[0];
    if (first !== undefined) {
      positions.set(first.id, { x: cx, y: cy });
    }
    return positions;
  }

  // Simple circular layout
  const radius = Math.min(cx, cy) * 0.72;
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    positions.set(node.id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  });
  return positions;
}

export function StaticGraphView({ graph, width = 560, height = 380 }: StaticGraphViewProps) {
  const cx = width / 2;
  const cy = height / 2;
  const positions = layoutNodes(graph.nodes, cx, cy);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label="剧情图谱"
      role="img"
      style={{ display: 'block', border: '1px solid #e0e0e0', borderRadius: '4px', background: '#fafafa' }}
    >
      {/* Edges */}
      {graph.edges.map((edge: ArtifactGraphEdge) => {
        const src = positions.get(edge.source);
        const tgt = positions.get(edge.target);
        if (src === undefined || tgt === undefined) return null;
        const mx = (src.x + tgt.x) / 2;
        const my = (src.y + tgt.y) / 2;
        return (
          <g key={`${edge.source}-${edge.target}-${edge.type}`}>
            <line
              x1={src.x.toFixed(1)}
              y1={src.y.toFixed(1)}
              x2={tgt.x.toFixed(1)}
              y2={tgt.y.toFixed(1)}
              stroke="#bdbdbd"
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
            <text
              x={mx.toFixed(1)}
              y={(my - 4).toFixed(1)}
              textAnchor="middle"
              fontSize="9"
              fill="#9e9e9e"
            >
              {edge.type}
            </text>
          </g>
        );
      })}

      {/* Nodes */}
      {graph.nodes.map((node: ArtifactGraphNode) => {
        const pos = positions.get(node.id);
        if (pos === undefined) return null;
        const color = NODE_COLORS[node.type] ?? DEFAULT_NODE_COLOR;
        const x = pos.x - NODE_W / 2;
        const y = pos.y - NODE_H / 2;
        return (
          <g key={node.id}>
            <rect
              x={x.toFixed(1)}
              y={y.toFixed(1)}
              width={NODE_W}
              height={NODE_H}
              rx="4"
              fill={color.fill}
              stroke={color.stroke}
              strokeWidth="1.5"
            />
            <text
              x={pos.x.toFixed(1)}
              y={(pos.y - 5).toFixed(1)}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill={color.text}
            >
              {truncate(node.label, LABEL_MAX)}
            </text>
            <text
              x={pos.x.toFixed(1)}
              y={(pos.y + 10).toFixed(1)}
              textAnchor="middle"
              fontSize="9"
              fill={color.stroke}
            >
              {node.type}
            </text>
          </g>
        );
      })}

      {/* Arrowhead marker */}
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#bdbdbd" />
        </marker>
      </defs>
    </svg>
  );
}

import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';

import { GraphCanvas } from './GraphCanvas';

const STATUS_STYLES: Record<string, { background: string; color: string; border: string }> = {
  ready:      { background: '#e8f5e9', color: '#2e7d32', border: '#a5d6a7' },
  stale:      { background: '#fff8e1', color: '#f57f17', border: '#ffe082' },
  rebuilding: { background: '#e3f2fd', color: '#1565c0', border: '#90caf9' },
};

export function InteractiveDerivedGraph({
  graph,
}: {
  readonly graph: NonNullable<ArtifactSummary['derivedGraph']>;
}) {
  const statusStyle = STATUS_STYLES[graph.status] ?? { background: '#f5f5f5', color: '#616161', border: '#e0e0e0' };

  return (
    <section
      aria-label="剧情图谱 / 派生状态"
      style={{ border: '1px solid #e0e0e0', borderRadius: '4px', padding: '14px', background: '#fff', display: 'grid', gap: '12px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#212121' }}>剧情图谱 / 派生状态</h3>
        <span
          style={{
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            background: statusStyle.background,
            color: statusStyle.color,
            border: `1px solid ${statusStyle.border}`,
          }}
        >
          {graph.status}
        </span>
        <span style={{ fontSize: '12px', color: '#9e9e9e' }}>
          {graph.nodes.length} 个节点 / {graph.edges.length} 条边
        </span>
      </div>
      {graph.nodes.length > 0 && (
        <GraphCanvas graph={graph} height={420} />
      )}
      {graph.status === 'stale' && (
        <div
          role="status"
          style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ffe082', background: '#fff8e1', fontSize: '12px', color: '#f57f17' }}
        >
          图谱快照尚未追平最新 canonical 版本，当前展示的节点/边可能不是最新状态。
        </div>
      )}
    </section>
  );
}

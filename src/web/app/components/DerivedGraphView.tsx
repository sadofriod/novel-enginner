import type { ArtifactDerivedGraph } from '../../../runtime/artifact-detail';
import { StaticGraphView } from './StaticGraphView';

export interface DerivedGraphViewProps {
  readonly graph?: ArtifactDerivedGraph | undefined;
}

const STATUS_STYLES: Record<string, { background: string; color: string; border: string }> = {
  ready:      { background: '#e8f5e9', color: '#2e7d32', border: '#a5d6a7' },
  stale:      { background: '#fff8e1', color: '#f57f17', border: '#ffe082' },
  rebuilding: { background: '#e3f2fd', color: '#1565c0', border: '#90caf9' },
};
const DEFAULT_STATUS_STYLE = { background: '#f5f5f5', color: '#616161', border: '#e0e0e0' };

/**
 * 剧情图谱 / 派生状态 view (§6.2, §8.1-8.3).
 * Renders a static SVG graph (server-side safe, no DOM APIs).
 * For client-side interactive view, see GraphCanvas.tsx.
 */
export function DerivedGraphView({ graph }: DerivedGraphViewProps) {
  if (graph === undefined) {
    return (
      <section
        aria-label="剧情图谱 / 派生状态"
        style={{ border: '1px solid #e0e0e0', borderRadius: '4px', padding: '14px', background: '#fff' }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 700, color: '#212121' }}>剧情图谱 / 派生状态</h3>
        <p style={{ margin: 0, fontSize: '13px', color: '#9e9e9e' }}>当前工件还没有可展示的图谱或派生状态。</p>
      </section>
    );
  }

  const statusStyle = STATUS_STYLES[graph.status] ?? DEFAULT_STATUS_STYLE;

  return (
    <section
      aria-label="剧情图谱 / 派生状态"
      style={{ border: '1px solid #e0e0e0', borderRadius: '4px', padding: '14px', background: '#fff', display: 'grid', gap: '12px' }}
    >
      {/* Header */}
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
      </div>

      {/* Meta */}
      <table style={{ borderCollapse: 'collapse', fontSize: '12px', color: '#424242' }}>
        <tbody>
          {([
            ['latestCanonicalVersion', graph.latestCanonicalVersion ?? '—'],
            ['graphSnapshotVersion', graph.graphSnapshotVersion ?? '—'],
            ['节点数 / 边数', `${graph.nodes.length} 个节点  /  ${graph.edges.length} 条边`],
          ] as const).map(([k, v]) => (
            <tr key={k}>
              <td style={{ paddingRight: '12px', color: '#9e9e9e', fontWeight: 500, whiteSpace: 'nowrap' }}>{k}</td>
              <td style={{ fontFamily: 'monospace' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Static SVG graph */}
      {graph.nodes.length > 0 && (
        <StaticGraphView graph={graph} width={560} height={340} />
      )}

      {/* Stale warning */}
      {graph.status === 'stale' && (
        <div
          role="status"
          style={{
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid #ffe082',
            background: '#fff8e1',
            fontSize: '12px',
            color: '#f57f17',
          }}
        >
          图谱快照尚未追平最新 canonical 版本，当前展示的节点/边可能不是最新状态。
        </div>
      )}
    </section>
  );
}


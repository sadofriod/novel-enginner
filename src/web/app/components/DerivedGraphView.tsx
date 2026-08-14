import type { ArtifactDerivedGraph } from '../../../runtime/artifact-detail';

export interface DerivedGraphViewProps {
  readonly graph?: ArtifactDerivedGraph | undefined;
}

export function DerivedGraphView({ graph }: DerivedGraphViewProps) {
  if (graph === undefined) {
    return (
      <section aria-label="剧情图谱 / 派生状态" className="derived-graph">
        <h3>剧情图谱 / 派生状态</h3>
        <p>当前工件还没有可展示的图谱或派生状态。</p>
      </section>
    );
  }

  return (
    <section aria-label="剧情图谱 / 派生状态" className="derived-graph">
      <header>
        <h3>剧情图谱 / 派生状态</h3>
        <dl className="derived-graph-meta">
          <dt>status</dt>
          <dd>{graph.status}</dd>
          <dt>latestCanonicalVersion</dt>
          <dd>{graph.latestCanonicalVersion ?? '—'}</dd>
          <dt>graphSnapshotVersion</dt>
          <dd>{graph.graphSnapshotVersion ?? '—'}</dd>
        </dl>
      </header>

      <div className="derived-graph-grid">
        <section>
          <h4>节点</h4>
          <ul>
            {graph.nodes.map((node) => (
              <li key={node.id}>
                <strong>{node.label}</strong> <code>{node.type}</code>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h4>关系</h4>
          <ul>
            {graph.edges.map((edge) => (
              <li key={`${edge.source}-${edge.target}-${edge.type}`}>
                <code>{edge.source}</code> — {edge.type} → <code>{edge.target}</code>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}

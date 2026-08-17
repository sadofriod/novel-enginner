import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';

export interface ArtifactQueuePanelProps {
  readonly artifacts: readonly ArtifactSummary[];
  readonly selectedArtifact: ArtifactSummary | undefined;
}

function ArtifactLink({
  artifact,
  selected,
}: {
  readonly artifact: ArtifactSummary;
  readonly selected: boolean;
}) {
  const href = `/app?artifactType=${encodeURIComponent(artifact.artifactType)}&targetId=${encodeURIComponent(artifact.targetId)}`;
  return (
    <li>
      <a href={href} className={selected ? 'artifact-link artifact-link-selected' : 'artifact-link'}>
        <strong>{artifact.artifactType}</strong>
        <span>{artifact.targetId}</span>
        <small>{artifact.proposalStatus ?? 'no-active-proposal'}</small>
      </a>
    </li>
  );
}

function ArtifactLinkList({
  artifacts,
  selectedArtifact,
}: {
  readonly artifacts: readonly ArtifactSummary[];
  readonly selectedArtifact: ArtifactSummary | undefined;
}) {
  return (
    <ul className="artifact-links">
      {artifacts.map((artifact) => (
        <ArtifactLink
          key={`${artifact.artifactType}::${artifact.targetId}`}
          artifact={artifact}
          selected={selectedArtifact?.artifactType === artifact.artifactType && selectedArtifact.targetId === artifact.targetId}
        />
      ))}
    </ul>
  );
}

export function ArtifactQueuePanel({ artifacts, selectedArtifact }: ArtifactQueuePanelProps) {
  return (
    <aside className="panel">
      <h2>任务 / 审批队列</h2>
      {artifacts.length === 0 ? <p>暂无待处理 proposal。</p> : <ArtifactLinkList artifacts={artifacts} selectedArtifact={selectedArtifact} />}
    </aside>
  );
}

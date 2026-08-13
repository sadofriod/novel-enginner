import type { ArtifactSummary } from '../../runtime/store';
import { sortApprovalQueue } from '../queue-priority';

export interface ApprovalQueueProps {
  readonly artifacts: readonly ArtifactSummary[];
  readonly selectedKey?: string;
  readonly onSelect: (artifact: ArtifactSummary) => void;
}

export function artifactKey(artifactType: string, targetId: string): string {
  return `${artifactType}::${targetId}`;
}

/**
 * 任务/审批队列 view (docs/architecture/modules/06-web-console-and-approval.md §6.2),
 * ordered per §6.7: blocking severity, then artifact-type weight, then recency.
 */
export function ApprovalQueue({ artifacts, selectedKey, onSelect }: ApprovalQueueProps) {
  const ordered = sortApprovalQueue(artifacts);

  if (ordered.length === 0) {
    return <p className="approval-queue-empty">暂无待处理 proposal。</p>;
  }

  return (
    <ul className="approval-queue" aria-label="审批队列">
      {ordered.map((artifact) => {
        const key = artifactKey(artifact.artifactType, artifact.targetId);
        const isSelected = key === selectedKey;
        return (
          <li key={key}>
            <button
              type="button"
              aria-pressed={isSelected}
              className={isSelected ? 'queue-item queue-item-selected' : 'queue-item'}
              onClick={() => onSelect(artifact)}
            >
              <span className="queue-item-type">{artifact.artifactType}</span>
              <span className="queue-item-target">{artifact.targetId}</span>
              <span className="queue-item-status">{artifact.proposalStatus ?? 'no-active-proposal'}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

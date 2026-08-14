import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';
import { sortApprovalQueue } from '../queue-priority';

export interface ApprovalQueueProps {
  readonly artifacts: readonly ArtifactSummary[];
  readonly selectedKey?: string;
  readonly onSelect: (artifact: ArtifactSummary) => void;
}

export function artifactKey(artifactType: string, targetId: string): string {
  return `${artifactType}::${targetId}`;
}

const STATUS_STYLES: Record<string, { background: string; color: string }> = {
  'commit-blocked': { background: '#ffebee', color: '#c62828' },
  'waiting-sync':   { background: '#fff8e1', color: '#f57f17' },
  approved:         { background: '#e8f5e9', color: '#2e7d32' },
  rejected:         { background: '#fce4ec', color: '#880e4f' },
};

const DEFAULT_STATUS_STYLE = { background: '#f5f5f5', color: '#616161' };

function StatusChip({ status }: { readonly status: string }) {
  const style = STATUS_STYLES[status] ?? DEFAULT_STATUS_STYLE;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 600,
        background: style.background,
        color: style.color,
      }}
    >
      {status}
    </span>
  );
}

/**
 * 任务/审批队列 view (docs/architecture/modules/06-web-console-and-approval.md §6.2),
 * ordered per §6.7: blocking severity, then artifact-type weight, then recency.
 */
export function ApprovalQueue({ artifacts, selectedKey, onSelect }: ApprovalQueueProps) {
  const ordered = sortApprovalQueue(artifacts);

  if (ordered.length === 0) {
    return (
      <p style={{ fontSize: '13px', color: '#9e9e9e', margin: '8px 0' }}>
        暂无待处理 proposal。
      </p>
    );
  }

  return (
    <ul aria-label="审批队列" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '6px' }}>
      {ordered.map((artifact) => {
        const key = artifactKey(artifact.artifactType, artifact.targetId);
        const isSelected = key === selectedKey;
        const status = artifact.proposalStatus ?? 'no-active-proposal';
        return (
          <li key={key}>
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(artifact)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                border: `1px solid ${isSelected ? '#1976d2' : '#e0e0e0'}`,
                borderRadius: '4px',
                background: isSelected ? '#e3f2fd' : '#fff',
                cursor: 'pointer',
                display: 'grid',
                gap: '4px',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#212121' }}>
                {artifact.artifactType}
              </span>
              <span style={{ fontSize: '12px', color: '#616161' }}>{artifact.targetId}</span>
              <StatusChip status={status} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

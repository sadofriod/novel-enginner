import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';
import { Chip, List, ListItem, ListItemButton, ListItemText, Typography } from '@mui/material';
import { sortApprovalQueue } from '../queue-priority';

export interface ApprovalQueueProps {
  readonly artifacts: readonly ArtifactSummary[];
  readonly selectedKey?: string;
  readonly onSelect: (artifact: ArtifactSummary) => void;
}

export function artifactKey(artifactType: string, targetId: string): string {
  return `${artifactType}::${targetId}`;
}

const STATUS_COLORS: Record<string, { background: string; color: string }> = {
  'commit-blocked': { background: '#ffebee', color: '#c62828' },
  'waiting-sync':   { background: '#fff8e1', color: '#f57f17' },
  approved:         { background: '#e8f5e9', color: '#2e7d32' },
  rejected:         { background: '#fce4ec', color: '#880e4f' },
};

const DEFAULT_STATUS_STYLE = { background: '#f5f5f5', color: '#616161' };

function StatusChip({ status }: { readonly status: string }) {
  const style = STATUS_COLORS[status] ?? DEFAULT_STATUS_STYLE;
  return (
    <Chip
      size="small"
      label={status}
      sx={{ fontSize: 11, fontWeight: 600, background: style.background, color: style.color }}
    />
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
      <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>
        暂无待处理 proposal。
      </Typography>
    );
  }

  return (
    <List aria-label="审批队列" dense disablePadding sx={{ display: 'grid', gap: 0.75 }}>
      {ordered.map((artifact) => {
        const key = artifactKey(artifact.artifactType, artifact.targetId);
        const isSelected = key === selectedKey;
        const status = artifact.proposalStatus ?? 'no-active-proposal';
        return (
          <ListItem key={key} disablePadding>
            <ListItemButton
              selected={isSelected}
              aria-pressed={isSelected}
              onClick={() => onSelect(artifact)}
              sx={{ border: '1px solid', borderColor: isSelected ? 'primary.main' : 'divider', borderRadius: 1, display: 'grid', gap: 0.5, alignItems: 'start' }}
            >
              <ListItemText primary={artifact.artifactType} secondary={artifact.targetId} />
              <StatusChip status={status} />
            </ListItemButton>
          </ListItem>
        );
      })}
    </List>
  );
}

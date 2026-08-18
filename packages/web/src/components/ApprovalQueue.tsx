import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';
import { Checkbox, Chip, List, ListItem, ListItemButton, ListItemText, Typography } from '@mui/material';
import { sortApprovalQueue } from '../queue-priority';

export interface ApprovalQueueProps {
  readonly artifacts: readonly ArtifactSummary[];
  readonly selectedKey?: string;
  readonly onSelect: (artifact: ArtifactSummary) => void;
  /** Keys of artifacts selected for batch approval (multi-select). */
  readonly selectedKeys?: ReadonlySet<string>;
  readonly onToggleSelect?: (key: string) => void;
}

export function artifactKey(artifactType: string, targetId: string): string {
  return `${artifactType}::${targetId}`;
}

/** Proposal statuses that warrant an approval-queue entry (i.e. await a decision). */
export const ACTIONABLE_PROPOSAL_STATUSES: ReadonlySet<string> = new Set([
  'pending-review',
  'pending-approval',
  'commit-blocked',
  'waiting-sync',
]);

/**
 * True when the artifact is backed by a real, still-actionable proposal. The queue
 * only lists these, so it never shows a stale/hardcoded pending status that has no
 * backing Proposal record.
 */
export function isActionableProposal(artifact: ArtifactSummary): boolean {
  return (
    artifact.activeProposalId !== undefined
    && artifact.proposalStatus !== undefined
    && ACTIONABLE_PROPOSAL_STATUSES.has(artifact.proposalStatus)
  );
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

interface ApprovalQueueRowProps {
  readonly artifact: ArtifactSummary;
  readonly selectedKey?: string;
  readonly onSelect: (artifact: ArtifactSummary) => void;
  readonly isBatchSelected: boolean;
  readonly onToggleSelect?: (key: string) => void;
}

function ApprovalQueueRow({ artifact, selectedKey, onSelect, isBatchSelected, onToggleSelect }: ApprovalQueueRowProps) {
  const key = artifactKey(artifact.artifactType, artifact.targetId);
  const isSelected = key === selectedKey;
  const status = artifact.proposalStatus ?? 'no-active-proposal';
  return (
    <ListItem key={key} disablePadding sx={{ display: 'grid', gridTemplateColumns: onToggleSelect === undefined ? '1fr' : 'auto 1fr', alignItems: 'start', gap: 0.25 }}>
      {onToggleSelect === undefined ? null : (
        <Checkbox
          size="small"
          edge="start"
          checked={isBatchSelected}
          aria-label={`选择 ${artifact.artifactType}::${artifact.targetId}`}
          onChange={() => onToggleSelect(key)}
          onClick={(event) => event.stopPropagation()}
        />
      )}
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
}

/**
 * 任务/审批队列 view (docs/architecture/modules/06-web-console-and-approval.md §6.2),
 * ordered per §6.7: blocking severity, then artifact-type weight, then recency.
 * When `onToggleSelect` is provided, each item exposes a multi-select checkbox for
 * batch approval (via the `approve-batch` intent).
 */
export function ApprovalQueue({ artifacts, selectedKey, onSelect, selectedKeys, onToggleSelect }: ApprovalQueueProps) {
  const ordered = sortApprovalQueue(artifacts.filter(isActionableProposal));

  if (ordered.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>
        暂无待处理 proposal。
      </Typography>
    );
  }

  return (
    <List aria-label="审批队列" dense disablePadding sx={{ display: 'grid', gap: 0.75 }}>
      {ordered.map((artifact) => (
        <ApprovalQueueRow
          key={artifactKey(artifact.artifactType, artifact.targetId)}
          artifact={artifact}
          {...(selectedKey === undefined ? {} : { selectedKey })}
          onSelect={onSelect}
          isBatchSelected={selectedKeys?.has(artifactKey(artifact.artifactType, artifact.targetId)) ?? false}
          {...(onToggleSelect === undefined ? {} : { onToggleSelect })}
        />
      ))}
    </List>
  );
}

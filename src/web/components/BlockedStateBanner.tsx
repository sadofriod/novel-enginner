import type { ArtifactSummary } from '../../runtime/store';

const BLOCKED_STATUSES: ReadonlySet<string> = new Set(['commit-blocked', 'waiting-sync']);

export interface BlockedStateBannerProps {
  readonly artifact: ArtifactSummary;
}

/**
 * Surfaces the "approved but not yet committed" state from
 * docs/architecture/modules/06-web-console-and-approval.md §6.9 and §10.9's acceptance
 * criteria: the console must explicitly show blocked proposals rather than silently
 * treating them as done.
 */
export function BlockedStateBanner({ artifact }: BlockedStateBannerProps) {
  if (artifact.proposalStatus === undefined || !BLOCKED_STATUSES.has(artifact.proposalStatus)) {
    return null;
  }

  const bannerByStatus = {
    'commit-blocked': {
      icon: '⛔ 批准但未落盘',
      color: '#b71c1c',
      border: '#ef9a9a',
      background: '#ffebee',
      message: '已批准，但工作区当前无法安全写入 canonical。请修复工作区后重试落盘。',
    },
    'waiting-sync': {
      icon: '⏳ 等待同步',
      color: '#f57f17',
      border: '#ffe082',
      background: '#fff8e1',
      message: '已批准，正在等待工作区重新同步（waiting-sync）。落盘完成后会自动刷新。',
    },
  } as const;

  const banner = bannerByStatus[artifact.proposalStatus as keyof typeof bannerByStatus];
  if (banner === undefined) {
    return null;
  }

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        gap: '10px',
        padding: '10px 14px',
        borderRadius: '4px',
        border: `1px solid ${banner.border}`,
        background: banner.background,
        color: banner.color,
        fontSize: '13px',
      }}
    >
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
        {banner.icon}
      </span>
      <span>{banner.message}</span>
    </div>
  );
}

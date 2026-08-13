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

  const message =
    artifact.proposalStatus === 'commit-blocked'
      ? '已批准，但工作区当前无法安全写入 canonical。请修复工作区后重试落盘。'
      : '已批准，正在等待工作区重新同步（waiting-sync）。落盘完成后会自动刷新。';

  return (
    <div role="alert" className="blocked-banner">
      <strong>批准但未落盘</strong>
      <p>{message}</p>
    </div>
  );
}

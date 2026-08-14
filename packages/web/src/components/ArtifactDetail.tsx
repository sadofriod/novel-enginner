/* eslint-disable complexity */

import { useMemo, useState } from 'react';

import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';
import { inlineEditCharCount, isWithinInlineEditLimit, INLINE_EDIT_CHAR_LIMIT } from '../inline-edit-guard';

import { BlockedStateBanner } from './BlockedStateBanner';

export type ApprovalAction = 'approve' | 'reject' | 'override-approve' | 'export-draft' | 'delete';

export interface ArtifactDetailProps {
  readonly artifact: ArtifactSummary;
  readonly onAction: (action: ApprovalAction, note?: string) => void;
  readonly pending?: boolean;
  readonly actionForm?: {
    readonly actionPath: string;
    readonly workspaceId: string;
    readonly bookId: string;
    readonly redirectTo: string;
  };
}

const BTN_BASE: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: '4px',
  border: '1px solid',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background 0.15s, opacity 0.15s',
};

const BTN_STYLES: Record<string, React.CSSProperties> = {
  approve:          { ...BTN_BASE, background: '#1976d2', borderColor: '#1565c0', color: '#fff' },
  reject:           { ...BTN_BASE, background: '#fff', borderColor: '#d32f2f', color: '#d32f2f' },
  'override-approve': { ...BTN_BASE, background: '#f57c00', borderColor: '#e65100', color: '#fff' },
  'export-draft':   { ...BTN_BASE, background: '#fff', borderColor: '#9e9e9e', color: '#424242' },
  delete:           { ...BTN_BASE, background: '#fff', borderColor: '#bdbdbd', color: '#757575' },
};

const ACTION_LABELS: Record<ApprovalAction, string> = {
  approve: '✓ 批准',
  reject: '✗ 拒绝',
  'override-approve': '⚡ 豁免批准',
  'export-draft': '↗ 导出草稿',
  delete: '🗑 删除',
};

/**
 * 工件详情页 (docs/architecture/modules/06-web-console-and-approval.md §6.8): shows the
 * proposal/canonical status plus the §6.5 approval actions. The inline-edit note is
 * capped per §6.6 — any content beyond the short-text budget should be exported to
 * `drafts/` or edited in VS Code instead.
 */
export function ArtifactDetail({ artifact, onAction, pending = false, actionForm }: ArtifactDetailProps) {
  const [note, setNote] = useState('');
  const charCount = useMemo(() => inlineEditCharCount(note), [note]);
  const withinLimit = isWithinInlineEditLimit(note);

  const inlineEdit = (
    <div style={{ display: 'grid', gap: '6px' }}>
      <label
        htmlFor="inline-edit-note"
        style={{ fontSize: '12px', fontWeight: 600, color: '#616161' }}
      >
        短文本微修（结构字段 / 批注，≤{INLINE_EDIT_CHAR_LIMIT} 字）
      </label>
      <textarea
        id="inline-edit-note"
        name="note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        style={{
          width: '100%',
          padding: '8px',
          border: `1px solid ${withinLimit ? '#bdbdbd' : '#d32f2f'}`,
          borderRadius: '4px',
          fontSize: '13px',
          resize: 'vertical',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
        }}
      />
      <p
        style={{
          margin: 0,
          fontSize: '11px',
          color: withinLimit ? '#9e9e9e' : '#d32f2f',
        }}
      >
        {charCount} / {INLINE_EDIT_CHAR_LIMIT}
        {!withinLimit && ' — 超出微修边界，请改为导出到 drafts/ 或回到 VS Code 编辑'}
      </p>
    </div>
  );

  const actionButtons = (actions: readonly ApprovalAction[], isForm: boolean) =>
    actions.map((action) => {
      const style = { ...(BTN_STYLES[action] ?? BTN_BASE), opacity: pending ? 0.5 : 1 };
      return isForm ? (
        <button key={action} type="submit" name="intent" value={action} aria-label={action} disabled={pending} style={style}>
          {ACTION_LABELS[action]}
        </button>
      ) : (
        <button key={action} type="button" data-action={action} aria-label={action} disabled={pending} onClick={() => onAction(action, note)} style={style}>
          {ACTION_LABELS[action]}
        </button>
      );
    });

  const ACTIONS: readonly ApprovalAction[] = ['approve', 'reject', 'override-approve', 'export-draft', 'delete'];

  return (
    <section
      aria-label="工件详情"
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: '4px',
        padding: '16px',
        background: '#fff',
        display: 'grid',
        gap: '14px',
      }}
    >
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#212121' }}>
          {artifact.artifactType}
        </h2>
        <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#616161' }}>{artifact.targetId}</p>
      </div>

      {/* Meta */}
      <table style={{ borderCollapse: 'collapse', fontSize: '12px', color: '#424242' }}>
        <tbody>
          {([
            ['canonicalStatus', artifact.canonicalStatus ?? '—'],
            ['activeProposalId', artifact.activeProposalId ?? '—'],
            ['proposalStatus', artifact.proposalStatus ?? '—'],
            ['overrideAudit', artifact.overrideAudit === undefined ? '—' : artifact.overrideAudit.relatedRunId],
          ] as const).map(([k, v]) => (
            <tr key={k}>
              <td style={{ paddingRight: '12px', color: '#9e9e9e', fontWeight: 500, whiteSpace: 'nowrap' }}>{k}</td>
              <td style={{ fontFamily: 'monospace' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <BlockedStateBanner artifact={artifact} />

      {artifact.reviewStale === true && (
        <div
          role="alert"
          style={{
            display: 'flex',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '4px',
            border: '1px solid #ffe082',
            background: '#fff8e1',
            fontSize: '13px',
            color: '#f57f17',
          }}
        >
          <strong style={{ whiteSpace: 'nowrap' }}>⚠ review-stale</strong>
          <span>
            该工件在上次审批后被手工修改，原有 Reviewer 结果已失效。系统已触发异步 synthetic review；
            在重新评审结果可用前，下游自动流程将被阻断（§5.8）。
          </span>
        </div>
      )}

      {artifact.inlineEditNote !== undefined && artifact.inlineEditNote.length > 0 && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: '4px',
            border: '1px solid #e3f2fd',
            background: '#f8fbff',
            fontSize: '13px',
          }}
        >
          <strong style={{ display: 'block', marginBottom: '4px', color: '#1565c0' }}>最近一次 Web 微修</strong>
          <p style={{ margin: 0, color: '#424242' }}>{artifact.inlineEditNote}</p>
        </div>
      )}

      {actionForm === undefined && inlineEdit}

      {actionForm === undefined ? (
        <div role="group" aria-label="审批动作" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {actionButtons(ACTIONS, false)}
        </div>
      ) : (
        <form method="POST" action={actionForm.actionPath}>
          {inlineEdit}
          <input type="hidden" name="workspaceId" value={actionForm.workspaceId} />
          <input type="hidden" name="bookId" value={actionForm.bookId} />
          <input type="hidden" name="artifactType" value={artifact.artifactType} />
          <input type="hidden" name="targetId" value={artifact.targetId} />
          <input type="hidden" name="redirectTo" value={actionForm.redirectTo} />
          <input type="hidden" name="proposalStatus" value={artifact.proposalStatus ?? ''} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
            {actionButtons(ACTIONS, true)}
          </div>
        </form>
      )}
    </section>
  );
}

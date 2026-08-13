import { useMemo, useState } from 'react';

import type { ArtifactSummary } from '../../runtime/store';
import { inlineEditCharCount, isWithinInlineEditLimit, INLINE_EDIT_CHAR_LIMIT } from '../inline-edit-guard';

import { BlockedStateBanner } from './BlockedStateBanner';

export type ApprovalAction = 'approve' | 'reject' | 'override-approve' | 'export-draft' | 'delete';

export interface ArtifactDetailProps {
  readonly artifact: ArtifactSummary;
  readonly onAction: (action: ApprovalAction, note?: string) => void;
  readonly pending?: boolean;
}

/**
 * 工件详情页 (docs/architecture/modules/06-web-console-and-approval.md §6.8): shows the
 * proposal/canonical status plus the §6.5 approval actions. The inline-edit note is
 * capped per §6.6 — any content beyond the short-text budget should be exported to
 * `drafts/` or edited in VS Code instead.
 */
export function ArtifactDetail({ artifact, onAction, pending = false }: ArtifactDetailProps) {
  const [note, setNote] = useState('');
  const charCount = useMemo(() => inlineEditCharCount(note), [note]);
  const withinLimit = isWithinInlineEditLimit(note);

  return (
    <section aria-label="工件详情" className="artifact-detail">
      <header>
        <h2>{artifact.artifactType}</h2>
        <p className="artifact-target">{artifact.targetId}</p>
      </header>

      <dl className="artifact-meta">
        <dt>canonicalStatus</dt>
        <dd>{artifact.canonicalStatus ?? '—'}</dd>
        <dt>activeProposalId</dt>
        <dd>{artifact.activeProposalId ?? '—'}</dd>
        <dt>proposalStatus</dt>
        <dd>{artifact.proposalStatus ?? '—'}</dd>
      </dl>

      <BlockedStateBanner artifact={artifact} />

      <div className="inline-edit">
        <label htmlFor="inline-edit-note">短文本微修（结构字段 / 批注，≤{INLINE_EDIT_CHAR_LIMIT} 字）</label>
        <textarea
          id="inline-edit-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
        />
        <p className={withinLimit ? 'char-count' : 'char-count char-count-over'}>
          {charCount} / {INLINE_EDIT_CHAR_LIMIT}
          {!withinLimit && ' — 超出微修边界，请改为导出到 drafts/ 或回到 VS Code 编辑'}
        </p>
      </div>

      <div className="approval-actions" role="group" aria-label="审批动作">
        <button type="button" disabled={pending} onClick={() => onAction('approve', note)}>
          approve
        </button>
        <button type="button" disabled={pending} onClick={() => onAction('reject', note)}>
          reject
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onAction('override-approve', note)}
        >
          override-approve
        </button>
        <button type="button" disabled={pending} onClick={() => onAction('export-draft', note)}>
          export-draft
        </button>
        <button type="button" disabled={pending} onClick={() => onAction('delete', note)}>
          delete
        </button>
      </div>
    </section>
  );
}

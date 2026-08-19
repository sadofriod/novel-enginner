import { useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import ReactDiffViewer from 'react-diff-viewer-continued';

import { Box, IconButton, Paper, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

import type { ArtifactFieldDiff } from '@novel-enginner/services/runtime/artifact-detail';
import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';
import type { CommandResult } from '@novel-enginner/services/runtime/command-handler';
import type { BootstrapConfig, CommandInput, NewReviewThreadDraft, ProposalChainEntry, ReviewThreadWithComments } from '../../api-types';
import {
  useAddThreadCommentMutation,
  useDeleteCommentMutation,
  useEditCommentMutation,
  useGetProposalChainQuery,
  useListProposalThreadsQuery,
  useResolveThreadMutation,
  useSubmitCommandMutation,
  useUnresolveThreadMutation,
} from '../../control-api';

import { ReviewThreadList } from './review-thread-list';
import { FeedbackAlert, ReviewComposerSection, ReviewToolbar, RoundSwitcher } from './review-panel-toolbar';

export interface ReviewDiffPanelProps {
  readonly artifact: ArtifactSummary;
  readonly config: BootstrapConfig | undefined;
  readonly onClose: () => void;
}

export interface SelectedDiffLine {
  readonly field: string;
  readonly side: 'L' | 'R';
  readonly lineNumber: number;
}

/** A multi-line selection on a diff (GitHub-style range comment anchor). */
export interface SelectedDiffRange {
  readonly field: string;
  readonly side: 'L' | 'R';
  readonly startLine: number;
  readonly endLine: number;
}

function valueToText(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function lineSnapshotOf(diff: ArtifactFieldDiff, side: 'L' | 'R', fromLine: number, toLine: number): string {
  const text = side === 'R' ? valueToText(diff.proposed) : valueToText(diff.canonical);
  const lines = text.split('\n').slice(fromLine - 1, toLine);
  return lines.join('\n');
}

function hasReviewContent(drafts: readonly NewReviewThreadDraft[], overall: string): boolean {
  return drafts.length > 0 || overall.length > 0;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function rejectionMessage(result: { readonly message?: string }, fallback: string): string {
  return result.message ?? fallback;
}

function buildSubmitReviewCommand(
  config: BootstrapConfig,
  artifact: ArtifactSummary,
  proposalId: string,
  drafts: readonly NewReviewThreadDraft[],
  overall: string,
): CommandInput {
  return {
    workspaceId: config.workspaceId,
    bookId: config.bookId,
    artifactType: artifact.artifactType,
    targetId: artifact.targetId,
    intent: 'submit-review',
    requestedBy: 'author-local',
    approvalMode: 'manual',
    idempotencyKey: `web-submit-review-${proposalId}-${Date.now().toString(36)}`,
    proposalId,
    author: 'author-local',
    ...(overall.length === 0 ? {} : { overallComment: overall }),
    newThreads: drafts,
    replies: [],
  };
}

function buildHighlight(range: SelectedDiffRange | undefined, field: string): string[] {
  if (range === undefined || range.field !== field) {
    return [];
  }
  const from = Math.min(range.startLine, range.endLine);
  const to = Math.max(range.startLine, range.endLine);
  const lines: string[] = [];
  for (let line = from; line <= to; line += 1) {
    lines.push(`${range.side}${line}`);
  }
  return lines;
}

function resolveAnchorDiff(
  diffs: readonly ArtifactFieldDiff[],
  range: SelectedDiffRange,
): ArtifactFieldDiff | undefined {
  return diffs.find((entry) => entry.field === range.field) ?? diffs[0];
}

function buildDraft(
  proposalId: string,
  range: SelectedDiffRange | undefined,
  body: string,
  diffs: readonly ArtifactFieldDiff[],
): NewReviewThreadDraft | undefined {
  if (range === undefined || body.trim().length === 0) {
    return undefined;
  }
  const diff = resolveAnchorDiff(diffs, range);
  if (diff === undefined) {
    return undefined;
  }
  const from = Math.min(range.startLine, range.endLine);
  const to = Math.max(range.startLine, range.endLine);
  return {
    proposalId,
    field: range.field,
    side: range.side,
    lineNumber: from,
    ...(to === from ? {} : { lineCount: to - from + 1 }),
    lineSnapshot: lineSnapshotOf(diff, range.side, from, to),
    body: body.trim(),
  };
}

function optimizeFeedback(result: CommandResult): { readonly kind: 'success' | 'error'; readonly message: string } {
  return result.status === 'accepted'
    ? { kind: 'success', message: `优化已提交（run ${result.runId}），将依据未解决评论生成新一轮 proposal。` }
    : { kind: 'error', message: rejectionMessage(result, `优化被拒绝（${result.code}）。`) };
}

function resolvePanelData(artifact: ArtifactSummary): { readonly proposalId: string; readonly diffs: readonly ArtifactFieldDiff[] } {
  const proposalId = artifact.activeProposalId ?? '';
  const diffs = artifact.proposalDetail?.diffs ?? [];
  return { proposalId, diffs };
}

function reviewQueryArg(proposalId: string): string | typeof skipToken {
  return proposalId === '' ? skipToken : proposalId;
}

function isPanelEmpty(proposalId: string, diffs: readonly ArtifactFieldDiff[]): boolean {
  return proposalId === '' || diffs.length === 0;
}

type ReviewOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly feedback: { readonly kind: 'error'; readonly message: string } };

async function runSubmitReview(
  submitCommand: ReturnType<typeof useSubmitCommandMutation>[0],
  config: BootstrapConfig,
  artifact: ArtifactSummary,
  proposalId: string,
  drafts: readonly NewReviewThreadDraft[],
  overall: string,
): Promise<ReviewOutcome> {
  try {
    const result = await submitCommand(buildSubmitReviewCommand(config, artifact, proposalId, drafts, overall)).unwrap();
    if (result.status === 'accepted') {
      return { ok: true };
    }
    return { ok: false, feedback: { kind: 'error', message: rejectionMessage(result, `审阅提交被拒绝（${result.code}）。`) } };
  } catch (cause) {
    return { ok: false, feedback: { kind: 'error', message: errorMessage(cause) } };
  }
}

function ClickableFieldDiff({
  diff,
  selectedRange,
  onSelectLine,
}: {
  readonly diff: ArtifactFieldDiff;
  readonly selectedRange: SelectedDiffRange | undefined;
  readonly onSelectLine: (line: SelectedDiffLine) => void;
}) {
  const highlight = buildHighlight(selectedRange, diff.field);
  return (
    <div className="diff-field-block">
      <div className="diff-field-head">
        <code>{diff.field}</code>
        {diff.changed ? <span className="diff-badge">changed</span> : null}
      </div>
      <ReactDiffViewer
        oldValue={valueToText(diff.canonical)}
        newValue={valueToText(diff.proposed)}
        splitView={false}
        showDiffOnly
        onLineNumberClick={(lineId) => {
          const match = /^([LR])-(\d+)$/.exec(lineId);
          if (match !== null) {
            onSelectLine({ field: diff.field, side: match[1] as 'L' | 'R', lineNumber: Number(match[2]) });
          }
        }}
        highlightLines={highlight}
        renderGutter={({ lineNumber, prefix }) => (
          <button
            type="button"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#1565c0', fontSize: 12 }}
            onClick={() => onSelectLine({ field: diff.field, side: prefix as 'L' | 'R', lineNumber })}
            aria-label={`在 ${prefix}${lineNumber} 行评论`}
          >
            ＋
          </button>
        )}
      />
    </div>
  );
}

function DiffSection({
  diffs,
  selectedRange,
  onSelectLine,
}: {
  readonly diffs: readonly ArtifactFieldDiff[];
  readonly selectedRange: SelectedDiffRange | undefined;
  readonly onSelectLine: (line: SelectedDiffLine) => void;
}) {
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        差异（点击行号添加评论，可再点另一行扩展选区）
      </Typography>
      {diffs.map((diff) => (
        <ClickableFieldDiff key={diff.field} diff={diff} selectedRange={selectedRange} onSelectLine={onSelectLine} />
      ))}
    </Box>
  );
}

function resolveCanonicalText(artifact: ArtifactSummary): string {
  const first = artifact.proposalDetail?.diffs[0]?.canonical;
  return typeof first === 'string' ? first : '';
}

function artifactDiffs(artifact: ArtifactSummary): readonly ArtifactFieldDiff[] {
  return artifact.proposalDetail?.diffs ?? [];
}

function buildRoundDiff(canonicalText: string, content: string | undefined): ArtifactFieldDiff {
  const proposed = content ?? '';
  return { field: 'content', canonical: canonicalText, proposed, changed: proposed !== canonicalText };
}

/** Diffs to render for the selected round: latest uses the server-computed diff, older rounds diff against the round's draft content. */
function resolveDisplayDiffs(
  artifact: ArtifactSummary,
  selectedEntry: ProposalChainEntry | undefined,
  isLatest: boolean,
): readonly ArtifactFieldDiff[] {
  if (isLatest) {
    return artifactDiffs(artifact);
  }
  return [buildRoundDiff(resolveCanonicalText(artifact), selectedEntry?.content)];
}

function resolveDisplayThreads(
  isLatest: boolean,
  liveThreads: readonly ReviewThreadWithComments[],
  selectedEntry: ProposalChainEntry | undefined,
): readonly ReviewThreadWithComments[] {
  if (isLatest) {
    return liveThreads;
  }
  return selectedEntry?.threads ?? [];
}

export function ReviewDiffPanel({ artifact, config, onClose }: ReviewDiffPanelProps) {
  const { proposalId, diffs } = resolvePanelData(artifact);
  const [drafts, setDrafts] = useState<readonly NewReviewThreadDraft[]>([]);
  const [selectedRange, setSelectedRange] = useState<SelectedDiffRange>();
  const [draftBody, setDraftBody] = useState('');
  const [overall, setOverall] = useState('');
  const [feedback, setFeedback] = useState<{ readonly kind: 'success' | 'error'; readonly message: string }>();
  const [submitting, setSubmitting] = useState(false);
  const [submitCommand] = useSubmitCommandMutation();
  const { data: threads = [], refetch } = useListProposalThreadsQuery(reviewQueryArg(proposalId));
  const { data: chain = [] } = useGetProposalChainQuery(reviewQueryArg(proposalId));
  const [selectedRoundId, setSelectedRoundId] = useState(proposalId);
  const [resolveMutation] = useResolveThreadMutation();
  const [unresolveMutation] = useUnresolveThreadMutation();
  const [replyMutation] = useAddThreadCommentMutation();
  const [editMutation] = useEditCommentMutation();
  const [deleteMutation] = useDeleteCommentMutation();
  const selectedEntry = chain.find((entry) => entry.proposalId === selectedRoundId) ?? chain[0];
  const isLatest = selectedRoundId === proposalId;
  const displayDiffs = resolveDisplayDiffs(artifact, selectedEntry, isLatest);
  const displayThreads = resolveDisplayThreads(isLatest, threads, selectedEntry);

  if (isPanelEmpty(proposalId, diffs)) {
    return (
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="body2" color="text.secondary">
          当前没有可审阅的 proposal 差异。
        </Typography>
      </Paper>
    );
  }

  const handleSelectLine = (line: SelectedDiffLine): void => {
    setSelectedRange((current) => {
      if (current === undefined || current.field !== line.field || current.side !== line.side) {
        return { field: line.field, side: line.side, startLine: line.lineNumber, endLine: line.lineNumber };
      }
      return { ...current, endLine: line.lineNumber };
    });
  };

  const addDraft = (): void => {
    const draft = buildDraft(proposalId, selectedRange, draftBody, diffs);
    if (draft === undefined) {
      return;
    }
    setDrafts((current) => [...current, draft]);
    setDraftBody('');
    setSelectedRange(undefined);
  };

  const submitReview = async (): Promise<void> => {
    if (config === undefined || submitting) {
      return;
    }
    if (!hasReviewContent(drafts, overall.trim())) {
      setFeedback({ kind: 'error', message: '请先添加至少一条行评论或填写整体意见。' });
      return;
    }
    setSubmitting(true);
    setFeedback(undefined);
    const outcome = await runSubmitReview(submitCommand, config, artifact, proposalId, drafts, overall.trim());
    if (outcome.ok) {
      setFeedback({ kind: 'success', message: '审阅已提交，proposal 已进入 changes-requested。' });
      setDrafts([]);
      setOverall('');
      setSelectedRange(undefined);
      void refetch();
    } else {
      setFeedback(outcome.feedback);
    }
    setSubmitting(false);
  };

  const optimize = async (): Promise<void> => {
    if (config === undefined || submitting) {
      return;
    }
    setSubmitting(true);
    setFeedback(undefined);
    try {
      const result = await submitCommand({
        workspaceId: config.workspaceId,
        bookId: config.bookId,
        artifactType: artifact.artifactType,
        targetId: artifact.targetId,
        intent: 'optimize',
        requestedBy: 'author-local',
        approvalMode: 'manual',
        idempotencyKey: `web-optimize-${proposalId}-${Date.now().toString(36)}`,
      }).unwrap();
      setFeedback(optimizeFeedback(result));
    } catch (cause) {
      setFeedback({ kind: 'error', message: errorMessage(cause) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'grid', gap: 1.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
          Proposal 审阅 · {artifact.artifactType} :: {artifact.targetId}
        </Typography>
        <IconButton size="small" aria-label="关闭差异视图" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
      <RoundSwitcher chain={chain} selectedRoundId={selectedRoundId} onSelect={setSelectedRoundId} />

      <ReviewToolbar
        isLatest={isLatest}
        submitting={submitting}
        draftCount={drafts.length}
        onSubmit={() => void submitReview()}
        onOptimize={() => void optimize()}
      />

      <FeedbackAlert feedback={feedback} />

      <ReviewComposerSection
        isLatest={isLatest}
        selectedRange={selectedRange}
        draftBody={draftBody}
        onDraftBodyChange={setDraftBody}
        onAdd={addDraft}
        overall={overall}
        onOverallChange={setOverall}
      />

      <DiffSection diffs={displayDiffs} selectedRange={selectedRange} onSelectLine={handleSelectLine} />

      <Box sx={{ display: 'grid', gap: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          已提交评论
        </Typography>
        <ReviewThreadList
          threads={displayThreads}
          readOnly={!isLatest}
          onResolve={(threadId) => void resolveMutation({ threadId, by: 'author-local' }).unwrap()}
          onUnresolve={(threadId) => void unresolveMutation(threadId).unwrap()}
          onReply={(threadId, body) => void replyMutation({ threadId, body, author: 'author-local' }).unwrap()}
          onEditComment={(commentId, body) => void editMutation({ commentId, body }).unwrap()}
          onDeleteComment={(commentId) => void deleteMutation(commentId).unwrap()}
        />
      </Box>
    </Paper>
  );
}


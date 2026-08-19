import { Alert, Button, FormControl, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';

import type { ProposalChainEntry } from '../../api-types';
import type { SelectedDiffRange } from './review-diff-panel';

function rangeLabel(range: SelectedDiffRange): string {
  const side = range.side === 'R' ? '新增' : '原';
  const anchor = range.startLine === range.endLine
    ? `${side} ${range.startLine}`
    : `${side} ${range.startLine}–${range.endLine}`;
  return `${anchor}（${range.field}）`;
}

export function DraftComposer({
  selectedRange,
  draftBody,
  onDraftBodyChange,
  onAdd,
}: {
  readonly selectedRange: SelectedDiffRange | undefined;
  readonly draftBody: string;
  readonly onDraftBodyChange: (body: string) => void;
  readonly onAdd: () => void;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1, display: 'grid', gap: 0.75 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        草稿评论
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary">
          选中行：
        </Typography>
        {selectedRange === undefined ? (
          <Typography variant="caption" color="text.disabled">
            未选中（点击 diff 行号开始，再点另一行扩展选区）
          </Typography>
        ) : (
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
            {rangeLabel(selectedRange)}
          </Typography>
        )}
      </Stack>
      <TextField
        size="small"
        fullWidth
        multiline
        minRows={2}
        placeholder="输入这条行评论…"
        value={draftBody}
        onChange={(event) => onDraftBodyChange(event.target.value)}
      />
      <Button
        size="small"
        variant="outlined"
        disabled={selectedRange === undefined || draftBody.trim().length === 0}
        onClick={onAdd}
      >
        添加草稿
      </Button>
    </Paper>
  );
}

export function RoundSwitcher({
  chain,
  selectedRoundId,
  onSelect,
}: {
  readonly chain: readonly ProposalChainEntry[];
  readonly selectedRoundId: string;
  readonly onSelect: (proposalId: string) => void;
}) {
  if (chain.length <= 1) {
    return <Typography variant="caption" color="text.secondary">单轮（无历史版本）</Typography>;
  }
  return (
    <FormControl size="small" sx={{ minWidth: 200 }}>
      <InputLabel>轮次</InputLabel>
      <Select
        value={selectedRoundId}
        label="轮次"
        onChange={(event) => onSelect(String(event.target.value))}
      >
        {chain.map((entry, index) => (
          <MenuItem key={entry.proposalId} value={entry.proposalId}>
            第 {chain.length - index} 轮 · {entry.status}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

export function ReviewToolbar({
  isLatest,
  submitting,
  draftCount,
  onSubmit,
  onOptimize,
}: {
  readonly isLatest: boolean;
  readonly submitting: boolean;
  readonly draftCount: number;
  readonly onSubmit: () => void;
  readonly onOptimize: () => void;
}) {
  if (!isLatest) {
    return (
      <Alert severity="info" sx={{ py: 0, '& .MuiAlert-message': { fontSize: 12 } }}>
        正在查看历史轮次（只读，可 resolve 该轮评论）。
      </Alert>
    );
  }
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Button size="small" variant="contained" color="primary" disabled={submitting} onClick={onSubmit}>
        提交审阅（request-changes）
      </Button>
      <Button size="small" variant="outlined" color="secondary" disabled={submitting} onClick={onOptimize}>
        ✨ 优化（LLM → proposal）
      </Button>
      {draftCount > 0 ? (
        <Typography variant="caption" color="info.main">
          已草拟 {draftCount} 条行评论
        </Typography>
      ) : null}
    </Stack>
  );
}

export function FeedbackAlert({
  feedback,
}: {
  readonly feedback: { readonly kind: 'success' | 'error'; readonly message: string } | undefined;
}) {
  if (feedback === undefined) {
    return null;
  }
  return (
    <Alert severity={feedback.kind} sx={{ py: 0, '& .MuiAlert-message': { fontSize: 12 } }}>
      {feedback.message}
    </Alert>
  );
}

export function ReviewComposerSection({
  isLatest,
  selectedRange,
  draftBody,
  onDraftBodyChange,
  onAdd,
  overall,
  onOverallChange,
}: {
  readonly isLatest: boolean;
  readonly selectedRange: SelectedDiffRange | undefined;
  readonly draftBody: string;
  readonly onDraftBodyChange: (body: string) => void;
  readonly onAdd: () => void;
  readonly overall: string;
  readonly onOverallChange: (overall: string) => void;
}) {
  if (!isLatest) {
    return null;
  }
  return (
    <>
      <DraftComposer
        selectedRange={selectedRange}
        draftBody={draftBody}
        onDraftBodyChange={onDraftBodyChange}
        onAdd={onAdd}
      />
      <TextField
        size="small"
        fullWidth
        multiline
        minRows={1}
        placeholder="整体意见（可选）…"
        value={overall}
        onChange={(event) => onOverallChange(event.target.value)}
      />
    </>
  );
}

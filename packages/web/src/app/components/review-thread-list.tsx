import { useState } from 'react';

import { Box, Button, IconButton, List, ListItem, Paper, Stack, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

import type { ReviewThread, ReviewThreadWithComments } from '../../api-types';

export interface ReviewThreadListProps {
  readonly threads: readonly ReviewThreadWithComments[];
  readonly readOnly?: boolean;
  readonly onResolve: (threadId: string) => void;
  readonly onUnresolve: (threadId: string) => void;
  readonly onReply: (threadId: string, body: string) => void;
  readonly onEditComment: (commentId: string, body: string) => void;
  readonly onDeleteComment: (commentId: string) => void;
}

function CommentItem({
  commentId,
  author,
  body,
  createdAt,
  readOnly,
  onEdit,
  onDelete,
}: {
  readonly commentId: string;
  readonly author: string;
  readonly body: string;
  readonly createdAt: string;
  readonly readOnly: boolean;
  readonly onEdit: (commentId: string, body: string) => void;
  readonly onDelete: (commentId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);

  if (editing) {
    return (
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <TextField
          size="small"
          fullWidth
          multiline
          minRows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          size="small"
          variant="contained"
          disabled={draft.trim().length === 0}
          onClick={() => {
            onEdit(commentId, draft.trim());
            setEditing(false);
          }}
        >
          保存
        </Button>
      </Stack>
    );
  }

  return (
    <Box sx={{ display: 'grid', gap: 0.25 }}>
      <Typography variant="caption" color="text.secondary">
        {author} · {createdAt}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
        {body}
      </Typography>
      {readOnly ? null : (
        <Stack direction="row" spacing={0.5}>
          <Button size="small" onClick={() => { setDraft(body); setEditing(true); }}>
            编辑
          </Button>
          <IconButton size="small" aria-label="删除评论" onClick={() => onDelete(commentId)}>
            <DeleteIcon fontSize="inherit" />
          </IconButton>
        </Stack>
      )}
    </Box>
  );
}

function ThreadHeader({
  thread,
  onResolve,
  onUnresolve,
}: {
  readonly thread: ReviewThread;
  readonly onResolve: (threadId: string) => void;
  readonly onUnresolve: (threadId: string) => void;
}) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        {thread.side === 'R' ? '新增行' : '原行'} {thread.lineNumber}（{thread.field}）
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {thread.isResolved ? `已解决${thread.resolvedBy === undefined ? '' : ` · ${thread.resolvedBy}`}` : '未解决'}
      </Typography>
      {thread.isResolved ? (
        <Button size="small" variant="outlined" onClick={() => onUnresolve(thread.threadId)}>
          取消解决
        </Button>
      ) : (
        <Button size="small" variant="outlined" color="success" onClick={() => onResolve(thread.threadId)}>
          解决
        </Button>
      )}
    </Stack>
  );
}

function ThreadItem({
  item,
  readOnly,
  onResolve,
  onUnresolve,
  onReply,
  onEditComment,
  onDeleteComment,
}: {
  readonly item: ReviewThreadWithComments;
  readonly readOnly: boolean;
  readonly onResolve: (threadId: string) => void;
  readonly onUnresolve: (threadId: string) => void;
  readonly onReply: (threadId: string, body: string) => void;
  readonly onEditComment: (commentId: string, body: string) => void;
  readonly onDeleteComment: (commentId: string) => void;
}) {
  const [reply, setReply] = useState('');
  const thread = item.thread;

  return (
    <Paper variant="outlined" sx={{ p: 1, display: 'grid', gap: 0.75 }}>
      <ThreadHeader thread={thread} onResolve={onResolve} onUnresolve={onUnresolve} />
      <Typography variant="caption" color="text.disabled" sx={{ fontFamily: 'monospace' }}>
        {thread.lineSnapshot}
      </Typography>
      <List dense disablePadding sx={{ display: 'grid', gap: 0.5 }}>
        {item.comments.map((comment) => (
          <ListItem key={comment.commentId} disableGutters disablePadding sx={{ display: 'block' }}>
            <CommentItem
              commentId={comment.commentId}
              author={comment.author}
              body={comment.body}
              createdAt={comment.createdAt}
              readOnly={readOnly}
              onEdit={onEditComment}
              onDelete={onDeleteComment}
            />
          </ListItem>
        ))}
      </List>
      {readOnly ? null : (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <TextField
            size="small"
            fullWidth
            placeholder="回复…"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
          />
          <Button
            size="small"
            variant="contained"
            disabled={reply.trim().length === 0}
            onClick={() => {
              onReply(thread.threadId, reply.trim());
              setReply('');
            }}
          >
            回复
          </Button>
        </Stack>
      )}
    </Paper>
  );
}

export function ReviewThreadList({
  threads,
  readOnly = false,
  onResolve,
  onUnresolve,
  onReply,
  onEditComment,
  onDeleteComment,
}: ReviewThreadListProps) {
  if (threads.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        暂无审阅评论。点击 diff 上的行号添加行评论，或直接提交审阅。
      </Typography>
    );
  }
  return (
    <List dense disablePadding sx={{ display: 'grid', gap: 0.75 }}>
      {threads.map((item) => (
        <ThreadItem
          key={item.thread.threadId}
          item={item}
          readOnly={readOnly}
          onResolve={onResolve}
          onUnresolve={onUnresolve}
          onReply={onReply}
          onEditComment={onEditComment}
          onDeleteComment={onDeleteComment}
        />
      ))}
    </List>
  );
}

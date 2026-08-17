/* eslint-disable complexity */

import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import {
  useGetBootstrapConfigQuery,
  useGetBootstrapSessionQuery,
  useListBootstrapEvidenceQuery,
  useListBootstrapRevisionsQuery,
  useSubmitCommandMutation,
} from '../../control-api';

export function BootstrapWorkbench() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const isValidSession = sessionId !== undefined && sessionId !== 'new-book' && sessionId !== 'import';
  const { data: config } = useGetBootstrapConfigQuery(undefined, { skip: !isValidSession });
  const { data: session } = useGetBootstrapSessionQuery(sessionId ?? '', { skip: !isValidSession });
  const { data: revisions = [] } = useListBootstrapRevisionsQuery(sessionId ?? '', { skip: !isValidSession });
  const { data: evidence = [] } = useListBootstrapEvidenceQuery(sessionId ?? '', { skip: !isValidSession });
  const [submitCommand] = useSubmitCommandMutation();
  const [summary, setSummary] = useState('');
  const mapping: Record<string, unknown> = { entries: [] };
  const [sourceRoot, setSourceRoot] = useState(() => searchParams.get('sourceRoot') ?? '');
  const [targetRoot, setTargetRoot] = useState('');
  const [message, setMessage] = useState<string>();

  if (sessionId === 'new-book' || sessionId === 'import') {
    return (
      <Box component="main" sx={{ p: 4, display: 'grid', gap: 1 }}>
        <Typography variant="h5">{sessionId === 'new-book' ? '新建作品' : '导入作品'}</Typography>
        <Typography variant="body2" color="text.secondary">初始化会话将在提交第一项工作区信息后创建。</Typography>
        <Link to="/" style={{ color: '#1565c0' }}>返回工作区</Link>
      </Box>
    );
  }
  if (session === undefined) {
    return (
      <Box component="main" sx={{ p: 4, display: 'grid', gap: 1 }}>
        <Typography variant="h5">Bootstrap 工作台</Typography>
        <Typography variant="body2" color="text.secondary">正在读取会话，或会话不存在。</Typography>
        <Link to="/" style={{ color: '#1565c0' }}>返回工作区</Link>
      </Box>
    );
  }
  const submitSessionCommand = async (intent: 'submit-dialogue-round' | 'submit-market-research' | 'scan-import-directory' | 'confirm-import' | 'continue-bootstrap-session' | 'discard-bootstrap-session'): Promise<void> => {
    if (session === undefined) {
      return;
    }
    let parsedMapping: Record<string, unknown> | undefined;
    if (intent === 'scan-import-directory' || intent === 'confirm-import') {
      if (mapping !== undefined) {
        parsedMapping = mapping;
      }
    }
    if ((intent === 'submit-dialogue-round' || intent === 'submit-market-research') && summary.trim().length === 0) {
      setMessage('请先填写本阶段记录。');
      return;
    }
    const result = await submitCommand({
      workspaceId: session.workspaceId,
      bookId: session.bookId ?? 'book-local',
      systemTaskType: intent,
      intent,
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: `bootstrap-${intent}-${session.id}-${Date.now().toString(36)}`,
      sessionId: session.id,
      ...(summary.trim().length === 0 ? {} : { summary: summary.trim() }),
      ...(parsedMapping === undefined ? {} : { mapping: parsedMapping }),
      ...(intent !== 'confirm-import' ? {} : { sourceRoot, targetRoot: targetRoot || config?.workspaceRoot || '' }),
    }).unwrap();
    if (result.status !== 'accepted') {
      setMessage(result.message);
      return;
    }
    setSummary('');
    setMessage('已保存。');
  };

  const submitRound = (): void => {
    if (summary.trim().length === 0) {
      return;
    }
    submitSessionCommand(session.currentStage === 'market-research' ? 'submit-market-research' : 'submit-dialogue-round');
  };

  const confirmImport = (): void => {
    if (sourceRoot.trim().length === 0) {
      setMessage('请填写要导入的作品目录。');
      return;
    }
    submitSessionCommand('confirm-import');
  };
  return (
    <Box component="main" sx={{ maxWidth: 960, mx: 'auto', p: '32px 20px', display: 'grid', gap: 2.5 }}>
      <Link to="/" style={{ color: '#1565c0' }}>返回工作区</Link>
      <Box component="header" sx={{ display: 'grid', gap: 0.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>{session.bookName ?? 'Bootstrap 工作台'}</Typography>
        <Typography variant="body2" color="text.secondary">按当前阶段完成下面的任务，保存后再继续。</Typography>
        <Typography variant="body2" color="text.secondary">当前阶段：{session.currentStage}</Typography>
      </Box>
      <Paper variant="outlined" sx={{ p: 2, display: 'grid', gap: 1.5 }}>
        <Typography variant="h6">阶段修订</Typography>
        <Typography variant="body2" color="text.secondary">{revisions.length} 条不可变记录</Typography>
        <TextField
          aria-label="阶段输入"
          label="阶段输入"
          multiline
          minRows={4}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
        <Box>
          <Button variant="contained" onClick={submitRound}>保存本轮</Button>
        </Box>
      </Paper>
      {session.currentStage === 'import-scan' ? (
        <Paper variant="outlined" sx={{ p: 2, display: 'grid', gap: 1.5 }}>
          <Typography variant="h6">扫描作品目录</Typography>
          <Typography variant="body2" color="text.secondary">系统会识别作品简介、设定、卷纲和章节，并生成一份待确认的导入预览。</Typography>
          <Box>
            <Button variant="contained" onClick={() => submitSessionCommand('scan-import-directory')}>开始扫描</Button>
          </Box>
        </Paper>
      ) : null}
      {session.currentStage === 'import-mapping' ? (
        <Paper variant="outlined" sx={{ p: 2, display: 'grid', gap: 1.5 }}>
          <Typography variant="h6">确认导入</Typography>
          <TextField label="要导入的作品目录" aria-label="原始目录" size="small" value={sourceRoot} onChange={(event) => setSourceRoot(event.target.value)} placeholder="例如：/Users/me/Documents/my-novel" />
          <TextField label="导入到当前工作区" aria-label="Canonical 工作区目录" size="small" value={targetRoot || config?.workspaceRoot || ''} onChange={(event) => setTargetRoot(event.target.value)} slotProps={{ input: { readOnly: true } }} />
          <Box>
            <Button variant="contained" onClick={confirmImport}>确认导入</Button>
          </Box>
        </Paper>
      ) : null}
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" onClick={() => submitSessionCommand('continue-bootstrap-session')}>继续下一阶段</Button>
        <Button variant="outlined" color="error" onClick={() => submitSessionCommand('discard-bootstrap-session')}>放弃会话</Button>
      </Stack>
      {message === undefined ? null : <Typography role="status" variant="body2">{message}</Typography>}
      <Paper variant="outlined" sx={{ p: 2, display: 'grid', gap: 1 }}>
        <Typography variant="h6">研究证据</Typography>
        <Typography variant="body2" color="text.secondary">{evidence.length} 个来源</Typography>
      </Paper>
    </Box>
  );
}
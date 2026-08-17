/* eslint-disable complexity */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { BootstrapSession } from '@novel-enginner/services/bootstrap/types';
import { Box, Button, List, ListItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useCreateBootstrapSessionMutation, useGetBootstrapConfigQuery, useListBootstrapSessionsQuery } from '../../control-api';

export function WorkspaceHome() {
  const { data: sessions = [] } = useListBootstrapSessionsQuery();
  const { data: config } = useGetBootstrapConfigQuery();
  const [createBootstrapSession, { isLoading: isCreating }] = useCreateBootstrapSessionMutation();
  const [selectedPath, setSelectedPath] = useState<'new-book' | 'import'>();
  const [bookName, setBookName] = useState('');
  const [sourceRoot, setSourceRoot] = useState('');
  const [message, setMessage] = useState<string>();
  const navigate = useNavigate();

  const startSession = async (): Promise<void> => {
    if (selectedPath === undefined || config === undefined) {
      return;
    }
    if (selectedPath === 'import' && sourceRoot.trim().length === 0) {
      setMessage('请填写要导入的作品目录。');
      return;
    }
    const { result, sessionId } = await createBootstrapSession({
      path: selectedPath,
      ...(bookName.trim().length === 0 ? {} : { bookName: bookName.trim() }),
      config,
    }).unwrap();
    if (result.status !== 'accepted') {
      setMessage(result.message);
      return;
    }
    const sourceQuery = selectedPath === 'import' ? `?sourceRoot=${encodeURIComponent(sourceRoot.trim())}` : '';
    navigate(`/bootstrap/${encodeURIComponent(sessionId)}${sourceQuery}`);
  };

  return (
    <Box component="main" sx={{ maxWidth: 960, mx: 'auto', p: '32px 20px', display: 'grid', gap: 3 }}>
      <Box component="header" sx={{ display: 'grid', gap: 0.5 }}>
        <Typography variant="overline" color="text.secondary">
          Novel Enginner
        </Typography>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          工作区
        </Typography>
        <Typography variant="body2" color="text.secondary">
          开始创作或把已有作品接入当前工作区。
        </Typography>
      </Box>
      <Paper variant="outlined" sx={{ p: 2, display: 'grid', gap: 1.5 }}>
        <Typography variant="h6">当前工作区</Typography>
        <Typography variant="body2">已连接到配置中的作品和工作目录。创建会话时会自动使用它们。</Typography>
        <Typography variant="body2" color="text.secondary">
          工作目录：{config?.workspaceRoot ?? '正在读取配置…'}
        </Typography>
      </Paper>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Button variant="outlined" onClick={() => { setSelectedPath('new-book'); setMessage(undefined); }}>
          新建作品
        </Button>
        <Button variant="outlined" onClick={() => { setSelectedPath('import'); setMessage(undefined); }}>
          导入已有作品
        </Button>
        <Button component={Link} to="/workspace" variant="outlined" color="primary">
          进入已有工作区
        </Button>
      </Stack>
      {selectedPath === undefined ? null : (
        <Paper variant="outlined" sx={{ p: 2, display: 'grid', gap: 1.5 }}>
          <Typography variant="h6">{selectedPath === 'new-book' ? '新建作品向导' : '导入作品向导'}</Typography>
          <Typography variant="body2">
            {selectedPath === 'new-book'
              ? '先给作品取一个名字，然后按阶段补充灵感、设定和大纲。每一步都可以保存后继续。'
              : '先提供已有作品所在的目录，系统会先扫描并展示导入预览，确认后才会写入当前工作区。'}
          </Typography>
          {selectedPath === 'new-book' ? (
            <TextField
              label="作品名称（可稍后补充）"
              aria-label="作品名称"
              size="small"
              value={bookName}
              onChange={(event) => setBookName(event.target.value)}
              sx={{ width: '100%' }}
            />
          ) : (
            <TextField
              label="已有作品目录"
              aria-label="已有作品目录"
              size="small"
              value={sourceRoot}
              onChange={(event) => setSourceRoot(event.target.value)}
              placeholder="例如：/Users/me/Documents/my-novel"
              sx={{ width: '100%' }}
            />
          )}
          <Box>
            <Button variant="contained" onClick={() => { void startSession(); }} disabled={config === undefined || isCreating}>
              {selectedPath === 'new-book' ? '开始新建' : '开始导入'}
            </Button>
          </Box>
          {message === undefined ? null : <Typography role="status" variant="body2">{message}</Typography>}
        </Paper>
      )}
      <Box sx={{ display: 'grid', gap: 1 }}>
        <Typography variant="h6">可恢复的初始化会话</Typography>
        {sessions.length === 0 ? <Typography variant="body2" color="text.secondary">暂无可恢复会话。</Typography> : <SessionList sessions={sessions} />}
      </Box>
    </Box>
  );
}

function SessionList({ sessions }: { readonly sessions: readonly BootstrapSession[] }) {
  return (
    <List disablePadding sx={{ display: 'grid', gap: 1 }}>
      {sessions.map((session) => (
        <ListItem key={session.id} disablePadding>
          <Paper variant="outlined" sx={{ width: '100%', p: 1.5, display: 'grid', gap: 0.5 }}>
            <Link to={`/bootstrap/${encodeURIComponent(session.id)}`} style={{ color: '#1565c0', textDecoration: 'none' }}>
              {session.bookName ?? session.id}
            </Link>
            <Typography variant="caption" color="text.secondary">
              {session.currentStage} · {session.status}
            </Typography>
          </Paper>
        </ListItem>
      ))}
    </List>
  );
}
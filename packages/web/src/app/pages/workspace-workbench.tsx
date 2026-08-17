/* eslint-disable complexity */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { skipToken } from '@reduxjs/toolkit/query';

import { Box, Button, CircularProgress, List, ListItemButton, ListItemText, Paper, Stack, TextField, Typography } from '@mui/material';

import { EntityDetailView } from '../components/entity-detail';
import { WorkspaceTreeView } from '../components/workspace-tree';
import { WorkbenchDrawer } from '../components/workbench-drawer';
import { resolveSearchTarget } from '../components/search-locate';
import { useWorkspaceEventStream } from '../use-workspace-event-stream';
import {
  useGetBootstrapConfigQuery,
  useGetWorkspaceEntityQuery,
  useGetWorkspaceTreeQuery,
  useSearchWorkspaceQuery,
  useSubmitSyncMutation,
} from '../../control-api';

import type { WorkspaceSelection } from '../components/workspace-tree';
import type { WorkbenchDrawerTab } from '../components/workbench-drawer';
import type { SearchResponse } from '../../api-types';

export function WorkspaceWorkbench() {
  const { data: tree } = useGetWorkspaceTreeQuery();
  const { data: config } = useGetBootstrapConfigQuery();
  const [submitSync] = useSubmitSyncMutation();
  const [selection, setSelection] = useState<WorkspaceSelection>();
  const [drawerTab, setDrawerTab] = useState<WorkbenchDrawerTab>('approval');
  const [searchQuery, setSearchQuery] = useState('');

  const trimmedQuery = searchQuery.trim();
  const { data: search, isFetching: searching } = useSearchWorkspaceQuery(trimmedQuery, { skip: trimmedQuery.length === 0 });
  const { data: entity, isFetching: entityLoading } = useGetWorkspaceEntityQuery(selection === undefined ? skipToken : { kind: selection.kind, id: selection.id });

  useWorkspaceEventStream();

  const handleSync = (intent: 're-sync-state' | 'rebuild-graph'): void => {
    if (config === undefined) {
      return;
    }
    void submitSync({
      intent,
      input: {
        workspaceId: config.workspaceId,
        bookId: config.bookId,
        requestedBy: 'author-local',
        approvalMode: 'manual',
        idempotencyKey: `web-${intent}-${Date.now().toString(36)}`,
      },
    });
  };

  const handleLocate = (kind: string, id: string): void => {
    setSelection({ kind, id });
    setSearchQuery('');
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '300px 1fr 380px', gap: 1.5, minHeight: '100vh', p: 2, background: '#f8fafc', boxSizing: 'border-box' }}>
      <Paper
        component="aside"
        variant="outlined"
        sx={{ p: 1.5, display: 'grid', gap: 1.25, alignSelf: 'start', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}
      >
        <Box component="header" sx={{ display: 'grid', gap: 0.5 }}>
          <Link to="/" style={{ fontSize: 12, color: '#1565c0', textDecoration: 'none' }}>
            ← 工作区首页
          </Link>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            书目录
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ wordBreak: 'break-all' }}>
            {config?.workspaceRoot ?? '正在读取配置…'}
          </Typography>
        </Box>
        {tree === undefined ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <CircularProgress size={16} />
            <Typography variant="body2" color="text.secondary">
              加载书目录…
            </Typography>
          </Stack>
        ) : (
          <WorkspaceTreeView tree={tree} selected={selection} onSelect={setSelection} />
        )}
      </Paper>

      <Box component="main" sx={{ display: 'grid', gap: 1.5, alignContent: 'start', minWidth: 0 }}>
        <TopBar searchQuery={searchQuery} onSearchChange={setSearchQuery} onSync={handleSync} searching={searching} />
        {trimmedQuery.length === 0 ? (
          selection === undefined || (entity === undefined && !entityLoading) ? (
            <EmptyState />
          ) : entity === undefined ? (
            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="body2" color="text.secondary">
                加载内容…
              </Typography>
            </Paper>
          ) : (
            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <EntityDetailView entity={entity} />
            </Paper>
          )
        ) : (
          <SearchResults search={search} searching={searching} onLocate={handleLocate} />
        )}
      </Box>

      <WorkbenchDrawer tab={drawerTab} onTabChange={setDrawerTab} />
    </Box>
  );
}

function TopBar({
  searchQuery,
  onSearchChange,
  onSync,
  searching,
}: {
  readonly searchQuery: string;
  readonly onSearchChange: (query: string) => void;
  readonly onSync: (intent: 're-sync-state' | 'rebuild-graph') => void;
  readonly searching: boolean;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      <TextField
        size="small"
        aria-label="语义搜索"
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="搜索角色 / 章节 / 设定…"
        sx={{ flex: 1, minWidth: 180 }}
      />
      {searching ? <CircularProgress size={14} /> : null}
      <Button size="small" variant="outlined" onClick={() => onSync('re-sync-state')}>
        同步工作区
      </Button>
      <Button size="small" variant="outlined" onClick={() => onSync('rebuild-graph')}>
        重建图谱
      </Button>
      <Button size="small" component={Link} to="/">
        新建 / 导入
      </Button>
    </Paper>
  );
}

function SearchResults({
  search,
  searching,
  onLocate,
}: {
  readonly search: SearchResponse | undefined;
  readonly searching: boolean;
  readonly onLocate: (kind: string, id: string) => void;
}) {
  if (searching) {
    return <Typography variant="body2" color="text.secondary">搜索中…</Typography>;
  }
  if (search === undefined) {
    return null;
  }
  if (search.status !== 'ok' || search.results.length === 0) {
    return <Typography variant="body2" color="text.secondary">没有匹配结果（或搜索暂不可用）。</Typography>;
  }
  return (
    <Paper variant="outlined" sx={{ p: 1.5, display: 'grid', gap: 1 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        搜索结果
      </Typography>
      <List dense>
        {search.results.map((result) => {
          const target = resolveSearchTarget(result);
          return (
            <ListItemButton
              key={result.documentId}
              disabled={target === undefined}
              onClick={() => {
                if (target !== undefined) {
                  onLocate(target.kind, target.id);
                }
              }}
            >
              <ListItemText
                primary={result.text}
                secondary={`${result.kind} · 相似度 ${result.similarity.toFixed(2)}${target === undefined ? ' · （此类型暂不支持定位）' : ''}`}
              />
            </ListItemButton>
          );
        })}
      </List>
    </Paper>
  );
}

function EmptyState() {
  return (
    <Paper variant="outlined" sx={{ p: 5, display: 'grid', gap: 1, justifyContent: 'center', textAlign: 'center' }}>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        进入已有工作区
      </Typography>
      <Typography variant="body2" color="text.disabled">
        从左侧选择「卷 / 章节 / 设定实体」查看大纲细纲；审批、运行、图谱与能力注册表在右侧抽屉。
      </Typography>
    </Paper>
  );
}

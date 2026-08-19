/* eslint-disable complexity */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { skipToken } from '@reduxjs/toolkit/query';

import { Alert, Box, Button, CircularProgress, List, ListItemButton, ListItemText, Paper, Stack, TextField, Typography } from '@mui/material';

import { EntityDetailView } from '../components/entity-detail';
import { ChapterContentView } from '../components/chapter-view';
import { WorkspaceTreeView } from '../components/workspace-tree';
import { WorkbenchDrawer } from '../components/workbench-drawer';
import { ReviewDiffPanel } from '../components/review-diff-panel';
import { resolveSearchTarget } from '../components/search-locate';
import { useWorkspaceEventStream } from '../use-workspace-event-stream';
import {
  useGetBootstrapConfigQuery,
  useGetWorkspaceEntityQuery,
  useGetWorkspaceTreeQuery,
  useSearchWorkspaceQuery,
  useSubmitCommandMutation,
  useSubmitSyncMutation,
} from '../../control-api';

import type { WorkspaceSelection } from '../components/workspace-tree';
import type { WorkbenchDrawerTab } from '../components/workbench-drawer';
import type { SearchResponse } from '../../api-types';
import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';

/** Maps a tree selection kind to the `optimize` artifact type + action label (大纲/正文/细纲/设定). */
const KIND_TO_OPTIMIZE: Readonly<Record<string, { readonly artifactType: string; readonly label: string }>> = {
  volume: { artifactType: 'volume-outline', label: '优化卷大纲' },
  'chapter-outline': { artifactType: 'chapter-outline', label: '优化大纲 · 细纲' },
  'chapter-manuscript': { artifactType: 'chapter-manuscript', label: '优化正文' },
  'world-foundation': { artifactType: 'world-foundation', label: '优化世界设定' },
  'story-blueprint': { artifactType: 'story-blueprint', label: '优化故事蓝图' },
};

export function WorkspaceWorkbench() {
  const { data: tree } = useGetWorkspaceTreeQuery();
  const { data: config } = useGetBootstrapConfigQuery();
  const [submitSync] = useSubmitSyncMutation();
  const [submitCommand] = useSubmitCommandMutation();
  const [selection, setSelection] = useState<WorkspaceSelection>();
  const [reviewArtifact, setReviewArtifact] = useState<ArtifactSummary>();
  const [drawerTab, setDrawerTab] = useState<WorkbenchDrawerTab>('approval');
  const [searchQuery, setSearchQuery] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeFeedback, setOptimizeFeedback] = useState<string>();

  const trimmedQuery = searchQuery.trim();
  const { data: search, isFetching: searching } = useSearchWorkspaceQuery(trimmedQuery, { skip: trimmedQuery.length === 0 });
  const { data: entity, isFetching: entityLoading } = useGetWorkspaceEntityQuery(selection === undefined ? skipToken : { kind: selection.kind, id: selection.id });
  const selectedChapter = selection === undefined || tree === undefined
    ? undefined
    : tree.volumes.flatMap((volume) => volume.chapters).find((chapter) => chapter.id === selection.id);
  const manuscriptId = selectedChapter?.manuscriptId;

  /** Optimizable actions for the current selection: its own artifact plus the chapter manuscript when applicable. */
  const optimizeActions = useMemo(() => {
    if (selection === undefined || config === undefined) {
      return [];
    }
    const actions: { readonly artifactType: string; readonly targetId: string; readonly label: string }[] = [];
    const own = KIND_TO_OPTIMIZE[selection.kind];
    if (own !== undefined) {
      actions.push({ artifactType: own.artifactType, targetId: selection.id, label: own.label });
    }
    if (selection.kind === 'chapter-outline' && manuscriptId !== undefined) {
      actions.push({ artifactType: 'chapter-manuscript', targetId: manuscriptId, label: '优化正文' });
    }
    return actions;
  }, [selection, config, manuscriptId]);

  const handleOptimize = async (artifactType: string, targetId: string): Promise<void> => {
    if (config === undefined || optimizing) {
      return;
    }
    setOptimizing(true);
    setOptimizeFeedback(undefined);
    try {
      const result = await submitCommand({
        workspaceId: config.workspaceId,
        bookId: config.bookId,
        artifactType,
        targetId,
        intent: 'optimize',
        requestedBy: 'author-local',
        approvalMode: 'manual',
        idempotencyKey: `web-optimize-${targetId}-${Date.now().toString(36)}`,
      }).unwrap();
      setOptimizeFeedback(result.status === 'accepted'
        ? `优化已提交（run ${result.runId}），生成 proposal 后请到「审批」中批准。`
        : result.message ?? `优化命令被拒绝（${result.code}）。`);
    } catch (cause) {
      setOptimizeFeedback(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setOptimizing(false);
    }
  };

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
        sx={{ p: 1.5, display: 'grid', gap: 1.25, alignSelf: 'start', position: 'sticky', top: 16, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}
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
        {optimizeActions.length === 0 ? null : (
          <Paper variant="outlined" sx={{ p: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              优化 / 重写
            </Typography>
            {optimizeActions.map((action) => (
              <Button
                key={action.artifactType}
                size="small"
                variant="outlined"
                color="secondary"
                disabled={optimizing}
                onClick={() => void handleOptimize(action.artifactType, action.targetId)}
              >
                ✨ {action.label}
              </Button>
            ))}
            {optimizeFeedback === undefined ? null : (
              <Alert severity="info" sx={{ py: 0, flex: 1, '& .MuiAlert-message': { fontSize: 12 } }}>
                {optimizeFeedback}
              </Alert>
            )}
          </Paper>
        )}
        {reviewArtifact === undefined ? (
          trimmedQuery.length === 0 ? (
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
                {selection !== undefined && selection.kind === 'chapter-outline' ? (
                  <ChapterContentView
                    key={selection.id}
                    outlineEntity={entity}
                    {...(manuscriptId === undefined ? {} : { manuscriptId })}
                  />
                ) : (
                  <EntityDetailView entity={entity} />
                )}
              </Paper>
            )
          ) : (
            <SearchResults search={search} searching={searching} onLocate={handleLocate} />
          )
        ) : (
          <ReviewDiffPanel
            key={reviewArtifact.activeProposalId}
            artifact={reviewArtifact}
            config={config}
            onClose={() => setReviewArtifact(undefined)}
          />
        )}
      </Box>

      <WorkbenchDrawer tab={drawerTab} onTabChange={setDrawerTab} onSelectArtifact={setReviewArtifact} />
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
    <Paper variant="outlined" sx={{ p: 1.25, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', position: 'sticky', top: 16, zIndex: 1 }}>
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

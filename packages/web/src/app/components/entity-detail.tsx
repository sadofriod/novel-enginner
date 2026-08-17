import type { ReactNode } from 'react';

import { Box, Paper, Typography } from '@mui/material';

import { BodySections, ChapterOutlineDetail } from './chapter-outline-detail';

import type { WorkspaceEntityDetail } from '../../api-types';

export function EntityDetailView({ entity }: { readonly entity: WorkspaceEntityDetail }) {
  const render = RENDERERS[entity.kind] ?? ((current) => <GenericEntityDetail entity={current} />);
  return render(entity);
}

const RENDERERS: Readonly<Record<string, (entity: WorkspaceEntityDetail) => ReactNode>> = {
  'chapter-outline': (entity) => <ChapterOutlineDetail entity={entity} />,
  'chapter-manuscript': (entity) => <ManuscriptDetail entity={entity} />,
  volume: (entity) => <VolumeDetail entity={entity} />,
};

export function ManuscriptDetail({ entity }: { readonly entity: WorkspaceEntityDetail }) {
  const fm = entity.frontmatter;
  const sceneEntries = Object.entries(entity.scenes);
  return (
    <Box component="section" aria-label="正文草稿" sx={{ display: 'grid', gap: 2 }}>
      <Box component="header" sx={{ display: 'grid', gap: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {stringOf(fm, 'displayTitle') ?? entity.id}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          第 {numberOf(fm, 'chapterNumber') ?? '?'} 章 · 正文 · 状态 {stringOf(fm, 'status') ?? '—'}
        </Typography>
      </Box>
      {sceneEntries.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          暂无场景正文。
        </Typography>
      ) : (
        sceneEntries.map(([sceneId, prose]) => (
          <Box component="article" key={sceneId} sx={{ display: 'grid', gap: 0.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {sceneId}
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
              {prose}
            </Typography>
          </Box>
        ))
      )}
      <BodySections entity={entity} />
    </Box>
  );
}

function VolumeDetail({ entity }: { readonly entity: WorkspaceEntityDetail }) {
  const fm = entity.frontmatter;
  return (
    <Box component="section" aria-label="卷大纲" sx={{ display: 'grid', gap: 2 }}>
      <Box component="header" sx={{ display: 'grid', gap: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {stringOf(fm, 'title') ?? entity.id}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          第 {numberOf(fm, 'sequenceNumber') ?? '?'} 卷 · 状态 {stringOf(fm, 'status') ?? '—'} · 阶段 {stringOf(fm, 'stage') ?? '—'}
        </Typography>
      </Box>
      <FieldList frontmatter={pick(fm, ['goal', 'targetChapterCount', 'chapterRoster', 'requiredCluePayoffs', 'milestones'])} />
      <BodySections entity={entity} />
    </Box>
  );
}

export function GenericEntityDetail({ entity }: { readonly entity: WorkspaceEntityDetail }) {
  const label = stringOf(entity.frontmatter, 'displayTitle') ?? stringOf(entity.frontmatter, 'title') ?? stringOf(entity.frontmatter, 'name') ?? entity.id;
  return (
    <Box component="section" aria-label="实体详情" sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        {label}
      </Typography>
      <FieldList frontmatter={entity.frontmatter} />
      <BodySections entity={entity} />
    </Box>
  );
}

function stringOf(fm: Record<string, unknown>, key: string): string | undefined {
  const value = fm[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberOf(fm: Record<string, unknown>, key: string): number | undefined {
  const value = fm[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function pick(fm: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (fm[key] !== undefined) {
      result[key] = fm[key];
    }
  }
  return result;
}

function FieldList({ frontmatter }: { readonly frontmatter: Record<string, unknown> }) {
  const entries = Object.entries(frontmatter);
  if (entries.length === 0) {
    return null;
  }
  return (
    <Box
      component="section"
      aria-label="字段"
      sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
    >
      {entries.map(([key, value]) => (
        <Paper key={key} variant="outlined" sx={{ px: 1.25, py: 1 }}>
          <Typography variant="overline" color="text.disabled">
            {key}
          </Typography>
          <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
            {formatValue(value)}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (Array.isArray(value)) {
    return value.map(String).join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/* eslint-disable complexity */
import { Box, Chip, Divider, Stack, Typography } from '@mui/material';

import { EmotionCurve } from './emotion-curve';
import { MarkdownView } from './markdown-view';

import type { WorkspaceEntityDetail } from '../../api-types';
import type { EmotionStage } from './emotion-curve';

interface SceneSkeletonItem {
  readonly id: string;
  readonly purpose?: string | undefined;
  readonly locationId?: string | undefined;
}

function stringField(frontmatter: Record<string, unknown>, key: string): string | undefined {
  const value = frontmatter[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberField(frontmatter: Record<string, unknown>, key: string): number | undefined {
  const value = frontmatter[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringArray(frontmatter: Record<string, unknown>, key: string): readonly string[] {
  const value = frontmatter[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function sceneSkeletonOf(frontmatter: Record<string, unknown>): readonly SceneSkeletonItem[] {
  const value = frontmatter['sceneSkeleton'];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((scene) => {
    if (scene === null || typeof scene !== 'object') {
      return [];
    }
    const record = scene as Record<string, unknown>;
    const id = stringField(record, 'id');
    return id === undefined ? [] : [{ id, purpose: stringField(record, 'purpose'), locationId: stringField(record, 'locationId') }];
  });
}

function emotionCurveOf(frontmatter: Record<string, unknown>): readonly EmotionStage[] {
  const value = frontmatter['emotionCurve'];
  return Array.isArray(value) ? value.filter((stage): stage is EmotionStage => stage !== null && typeof stage === 'object') : [];
}

export function ChapterOutlineDetail({ entity }: { readonly entity: WorkspaceEntityDetail }) {
  const fm = entity.frontmatter;
  const scenes = sceneSkeletonOf(fm);
  const stages = emotionCurveOf(fm);

  return (
    <Box component="section" aria-label="章节细纲" sx={{ display: 'grid', gap: 2 }}>
      <Box component="header" sx={{ display: 'grid', gap: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {stringField(fm, 'displayTitle') ?? entity.id}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            第 {numberField(fm, 'chapterNumber') ?? '?'} 章 · 类型 {stringField(fm, 'chapterType') ?? '—'} · 状态 {stringField(fm, 'status') ?? '—'}
            {numberField(fm, 'targetWordCount') === undefined ? '' : ` · 目标 ${numberField(fm, 'targetWordCount')} 字`}
          </Typography>
        </Stack>
      </Box>

      <SceneSteps scenes={scenes} />

      {stages.length > 0 && <EmotionCurve stages={stages} />}

      <ClueRefs fm={fm} />

      <BodySections entity={entity} />
    </Box>
  );
}

function SceneSteps({ scenes }: { readonly scenes: readonly SceneSkeletonItem[] }) {
  return (
    <Box component="section" aria-label="场景骨架" sx={{ display: 'grid', gap: 1 }}>
      <Typography variant="subtitle2" color="text.secondary">
        场景骨架
      </Typography>
      {scenes.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          暂无场景骨架。
        </Typography>
      ) : (
        <Box component="ol" sx={{ margin: 0, paddingLeft: 3, display: 'grid', gap: 1 }}>
          {scenes.map((scene, index) => (
            <Box component="li" key={scene.id}>
              <Typography variant="body2" color="text.secondary">
                <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
                  {index + 1}. {scene.id}
                </Box>
                {scene.purpose === undefined ? '' : ` — ${scene.purpose}`}
                {scene.locationId === undefined ? '' : `（地点 ${scene.locationId}）`}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function ClueRefs({ fm }: { readonly fm: Record<string, unknown> }) {
  const active = stringArray(fm, 'activeClueIds');
  const resolve = stringArray(fm, 'resolveClueIds');
  const introduce = stringArray(fm, 'introduceClueIds');
  if (active.length === 0 && resolve.length === 0 && introduce.length === 0) {
    return null;
  }
  return (
    <Box component="section" aria-label="伏笔引用" sx={{ display: 'grid', gap: 0.5 }}>
      <Typography variant="subtitle2" color="text.secondary">
        伏笔引用
      </Typography>
      {introduce.length > 0 && (
        <Typography variant="body2" color="text.secondary">
          引入：
          {introduce.map((id) => (
            <Chip key={id} label={id} size="small" sx={{ ml: 0.5 }} />
          ))}
        </Typography>
      )}
      {active.length > 0 && (
        <Typography variant="body2" color="text.secondary">
          活跃：
          {active.map((id) => (
            <Chip key={id} label={id} size="small" sx={{ ml: 0.5 }} />
          ))}
        </Typography>
      )}
      {resolve.length > 0 && (
        <Typography variant="body2" color="text.secondary">
          回收：
          {resolve.map((id) => (
            <Chip key={id} label={id} size="small" sx={{ ml: 0.5 }} />
          ))}
        </Typography>
      )}
    </Box>
  );
}

export function BodySections({ entity }: { readonly entity: WorkspaceEntityDetail }) {
  const entries = Object.entries(entity.sections);
  if (entries.length === 0) {
    return null;
  }
  return (
    <Box component="section" aria-label="正文段落" sx={{ display: 'grid', gap: 1.5 }}>
      {entries.map(([title, content]) => (
        <Box key={title} sx={{ display: 'grid', gap: 0.5 }}>
          <Divider />
          <Typography variant="subtitle2" color="text.secondary">
            {title}
          </Typography>
          <MarkdownView content={content} />
        </Box>
      ))}
    </Box>
  );
}

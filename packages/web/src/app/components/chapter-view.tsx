import { useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';

import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';

import { EntityDetailView } from './entity-detail';
import { useGetWorkspaceEntityQuery } from '../../control-api';

import type { WorkspaceEntityDetail } from '../../api-types';

type ChapterViewMode = 'outline' | 'manuscript';

/**
 * Detail panel for a chapter with an outline-first "大纲 / 正文" segmented switch.
 * The 正文 view lazily fetches the chapter-manuscript entity (via its manuscriptId)
 * and renders it through the markdown→HTML display path. A chapter without a
 * manuscript file shows a placeholder instead of silently doing nothing.
 */
export function ChapterContentView({
  outlineEntity,
  manuscriptId,
}: {
  readonly outlineEntity: WorkspaceEntityDetail;
  readonly manuscriptId?: string;
}) {
  const [view, setView] = useState<ChapterViewMode>('outline');
  const manuscript = useGetWorkspaceEntityQuery(
    view === 'manuscript' && manuscriptId !== undefined ? { kind: 'chapter-manuscript', id: manuscriptId } : skipToken,
  );

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          aria-label="章节视图"
          onChange={(_event, value) => {
            if (value !== null) {
              setView(value);
            }
          }}
        >
          <ToggleButton value="outline">大纲</ToggleButton>
          <ToggleButton value="manuscript">正文</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {view === 'outline'
        ? <EntityDetailView entity={outlineEntity} />
        : <ManuscriptView {...(manuscriptId === undefined ? {} : { manuscriptId })} data={manuscript.data} loading={manuscript.isFetching} />}
    </Box>
  );
}

function ManuscriptView({
  manuscriptId,
  data,
  loading,
}: {
  readonly manuscriptId?: string;
  readonly data: WorkspaceEntityDetail | undefined;
  readonly loading: boolean;
}) {
  if (manuscriptId === undefined || (data === undefined && !loading)) {
    return <EmptyProse />;
  }
  if (data === undefined) {
    return (
      <Typography variant="body2" color="text.secondary">
        加载正文…
      </Typography>
    );
  }
  return <EntityDetailView entity={data} />;
}

function EmptyProse() {
  return (
    <Typography variant="body2" color="text.secondary">
      该章节暂无正文。
    </Typography>
  );
}

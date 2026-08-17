import { useMemo } from 'react';

import type { ArtifactSummary, RunRecord } from '@novel-enginner/services/runtime/store';
import { Box, Chip, List, ListItem, Paper, Typography } from '@mui/material';

export interface RunTracePanelProps {
  readonly runs?: readonly RunRecord[];
  readonly selectedArtifact?: ArtifactSummary | undefined;
}

const STATUS_COLORS: Record<string, { background: string; color: string }> = {
  running:   { background: '#e3f2fd', color: '#1976d2' },
  completed: { background: '#e8f5e9', color: '#2e7d32' },
  failed:    { background: '#ffebee', color: '#c62828' },
  aborted:   { background: '#fff8e1', color: '#f57f17' },
};

export function RunTracePanel({ runs = [], selectedArtifact }: RunTracePanelProps) {
  const visibleRuns = useMemo(() => {
    if (selectedArtifact === undefined) {
      return runs;
    }

    return runs.filter(
      (run) =>
        run.artifactType === selectedArtifact.artifactType &&
        run.targetId === selectedArtifact.targetId,
    );
  }, [runs, selectedArtifact]);

  return (
    <Box component="section" aria-label="运行追溯" sx={{ display: 'grid', gap: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        运行追溯
      </Typography>
      {visibleRuns.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          暂无关联运行记录。
        </Typography>
      ) : (
        <List dense disablePadding sx={{ display: 'grid', gap: 0.75 }}>
          {visibleRuns.map((run) => {
            const style = STATUS_COLORS[run.status] ?? { background: '#f5f5f5', color: '#616161' };
            return (
              <ListItem key={run.runId} disablePadding>
                <Paper variant="outlined" sx={{ width: '100%', px: 1.25, py: 1, display: 'grid', gap: 0.5 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, wordBreak: 'break-all' }}>
                    {run.runId}
                  </Typography>
                  <Chip size="small" label={run.status} sx={{ fontSize: 11, fontWeight: 600, background: style.background, color: style.color, width: 'fit-content' }} />
                  {run.nextExpectedState !== undefined && (
                    <Typography variant="caption" color="text.disabled">
                      {run.nextExpectedState}
                    </Typography>
                  )}
                </Paper>
              </ListItem>
            );
          })}
        </List>
      )}
    </Box>
  );
}

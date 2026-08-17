import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';

import { Box, Chip, Stack, Typography } from '@mui/material';
import { GraphCanvas } from './GraphCanvas';

const STATUS_STYLES: Record<string, { background: string; color: string; border: string }> = {
  ready:      { background: '#e8f5e9', color: '#2e7d32', border: '#a5d6a7' },
  stale:      { background: '#fff8e1', color: '#f57f17', border: '#ffe082' },
  rebuilding: { background: '#e3f2fd', color: '#1565c0', border: '#90caf9' },
};

export function InteractiveDerivedGraph({
  graph,
}: {
  readonly graph: NonNullable<ArtifactSummary['derivedGraph']>;
}) {
  const statusStyle = STATUS_STYLES[graph.status] ?? { background: '#f5f5f5', color: '#616161', border: '#e0e0e0' };

  return (
    <Box
      component="section"
      aria-label="剧情图谱 / 派生状态"
      sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, bgcolor: 'background.paper', display: 'grid', gap: 1.5 }}
    >
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          剧情图谱 / 派生状态
        </Typography>
        <Chip
          size="small"
          label={graph.status}
          sx={{ fontSize: 11, fontWeight: 600, background: statusStyle.background, color: statusStyle.color, border: `1px solid ${statusStyle.border}` }}
        />
        <Typography variant="caption" color="text.secondary">
          {graph.nodes.length} 个节点 / {graph.edges.length} 条边
        </Typography>
      </Stack>
      {graph.nodes.length > 0 && (
        <GraphCanvas graph={graph} height={420} />
      )}
      {graph.status === 'stale' && (
        <Box role="status" sx={{ px: 1.5, py: 1, borderRadius: 1, border: 1, borderColor: '#ffe082', bgcolor: '#fff8e1', fontSize: 12, color: '#f57f17' }}>
          图谱快照尚未追平最新 canonical 版本，当前展示的节点/边可能不是最新状态。
        </Box>
      )}
    </Box>
  );
}

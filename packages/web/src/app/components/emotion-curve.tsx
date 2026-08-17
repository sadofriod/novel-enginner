/* eslint-disable complexity */
import { Box, LinearProgress, Stack, Typography } from '@mui/material';

export interface EmotionStage {
  readonly id: string;
  readonly stageType: string;
  readonly emotionIntensity: number;
  readonly targetReaderEffects?: readonly string[];
  readonly sceneIds?: readonly string[];
  readonly summary?: string;
}

const STAGE_COLORS: Record<string, string> = {
  hook: '#1565c0',
  pressure: '#f57f17',
  'reveal-or-turn': '#7b1fa2',
  payoff: '#2e7d32',
  'rising-action': '#00897b',
  climax: '#c62828',
};

function clampIntensity(value: number): number {
  return Math.min(5, Math.max(1, Math.floor(value)));
}

export function EmotionCurve({ stages }: { readonly stages: readonly EmotionStage[] }) {
  return (
    <Box component="section" aria-label="情绪曲线" sx={{ display: 'grid', gap: 1 }}>
      <Typography variant="subtitle2" color="text.secondary">
        情绪曲线
      </Typography>
      {stages.map((stage) => {
        const color = STAGE_COLORS[stage.stageType] ?? '#546e7a';
        const intensity = clampIntensity(stage.emotionIntensity);
        const effects = stage.targetReaderEffects === undefined ? [] : stage.targetReaderEffects;
        return (
          <Box key={stage.id} sx={{ display: 'grid', gap: 0.5 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} color="text.primary">
                {stage.stageType}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                强度 {intensity}/5{effects.length > 0 ? ` · ${effects.join(' / ')}` : ''}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={intensity * 20}
              sx={{ height: 8, borderRadius: 1, '& .MuiLinearProgress-bar': { backgroundColor: color } }}
            />
            {stage.summary !== undefined && stage.summary.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                {stage.summary}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

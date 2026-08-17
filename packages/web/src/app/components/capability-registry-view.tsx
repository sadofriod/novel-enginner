/* eslint-disable complexity */
import { Box, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';

import { useGetWorkspaceEntityQuery } from '../../control-api';

interface CapabilityRecord {
  readonly id: string;
  readonly type: string;
  readonly enabled?: boolean;
  readonly visibility?: string;
  readonly allowedAgents?: readonly string[];
  readonly applicableArtifactTypes?: readonly string[];
}

export function capabilitiesOf(frontmatter: Record<string, unknown> | undefined): readonly CapabilityRecord[] {
  if (frontmatter === undefined) {
    return [];
  }
  const value = frontmatter['capabilities'];
  return Array.isArray(value) ? value.filter((item): item is CapabilityRecord => item !== null && typeof item === 'object') : [];
}

export function CapabilityRegistryView() {
  const { data: entity, isLoading } = useGetWorkspaceEntityQuery({ kind: 'capability-registry', id: 'registry' });
  const capabilities = capabilitiesOf(entity?.frontmatter);

  if (isLoading) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          加载能力注册表…
        </Typography>
      </Stack>
    );
  }

  return (
    <Box component="section" aria-label="能力注册表" sx={{ display: 'grid', gap: 1 }}>
      <Typography variant="subtitle2" color="text.secondary">
        能力注册表
      </Typography>
      {capabilities.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          未声明任何能力。
        </Typography>
      ) : (
        capabilities.map((capability) => (
          <Paper key={capability.id} variant="outlined" sx={{ px: 1.25, py: 1, display: 'grid', gap: 0.5 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {capability.id}
              </Typography>
              <Chip
                size="small"
                label={capability.enabled === false ? 'disabled' : 'enabled'}
                color={capability.enabled === false ? 'error' : 'success'}
                variant="outlined"
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {capability.type}
              {capability.visibility === undefined ? '' : ` · ${capability.visibility}`}
            </Typography>
            {capability.allowedAgents !== undefined && capability.allowedAgents.length > 0 && (
              <Typography variant="caption" color="text.disabled">
                agents: {capability.allowedAgents.join(', ')}
              </Typography>
            )}
          </Paper>
        ))
      )}
    </Box>
  );
}

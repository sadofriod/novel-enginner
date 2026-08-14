import type { RuntimeRouteDefinition } from '../../../types';

export const getRunStreamRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/runs/:runId/stream',
  handle: ({ api, params, request }) => api.handleRunStream(params['runId'] as string, request),
};

import type { RuntimeRouteDefinition } from '../../types';

export const getRunRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/runs/:runId',
  handle: ({ api, params }) => api.handleGetRun(params['runId'] as string),
};

import type { RuntimeRouteDefinition } from '../types';

export const getRunsRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/runs',
  handle: ({ api }) => api.handleListRuns(),
};

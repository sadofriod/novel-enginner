import type { RuntimeRouteDefinition } from '../../types';

export const getWorkspaceTreeRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/workspace/tree',
  handle: ({ api }) => api.handleGetWorkspaceTree(),
};

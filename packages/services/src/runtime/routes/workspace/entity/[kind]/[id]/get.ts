import type { RuntimeRouteDefinition } from '../../../../types';

export const getWorkspaceEntityRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/workspace/entity/:kind/:id',
  handle: ({ api, params }) => api.handleGetWorkspaceEntity(params['kind'] as string, params['id'] as string),
};

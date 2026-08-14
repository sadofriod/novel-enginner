import type { RuntimeRouteDefinition } from '../../types';

export const postRebuildGraphRoute: RuntimeRouteDefinition = {
  method: 'POST',
  pattern: '/sync/rebuild-graph',
  handle: ({ api, request }) => api.handleSyncCommand('rebuild-graph', request),
};

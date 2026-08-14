import type { RuntimeRouteDefinition } from '../../types';

export const postReSyncStateRoute: RuntimeRouteDefinition = {
  method: 'POST',
  pattern: '/sync/re-sync-state',
  handle: ({ api, request }) => api.handleSyncCommand('re-sync-state', request),
};

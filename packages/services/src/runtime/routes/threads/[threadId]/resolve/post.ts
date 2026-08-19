import type { RuntimeRouteDefinition } from '../../../types';

export const postThreadResolveRoute: RuntimeRouteDefinition = {
  method: 'POST',
  pattern: '/threads/:threadId/resolve',
  handle: ({ api, params, request }) => api.handleResolveThread(params['threadId'] ?? '', request),
};

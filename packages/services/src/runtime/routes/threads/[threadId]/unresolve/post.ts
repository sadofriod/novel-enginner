import type { RuntimeRouteDefinition } from '../../../types';

export const postThreadUnresolveRoute: RuntimeRouteDefinition = {
  method: 'POST',
  pattern: '/threads/:threadId/unresolve',
  handle: ({ api, params }) => api.handleUnresolveThread(params['threadId'] ?? ''),
};

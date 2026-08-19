import type { RuntimeRouteDefinition } from '../../../types';

export const postThreadCommentsRoute: RuntimeRouteDefinition = {
  method: 'POST',
  pattern: '/threads/:threadId/comments',
  handle: ({ api, params, request }) => api.handleAddThreadComment(params['threadId'] ?? '', request),
};

import type { RuntimeRouteDefinition } from '../../types';

export const patchCommentRoute: RuntimeRouteDefinition = {
  method: 'PATCH',
  pattern: '/comments/:commentId',
  handle: ({ api, params, request }) => api.handleEditComment(params['commentId'] ?? '', request),
};

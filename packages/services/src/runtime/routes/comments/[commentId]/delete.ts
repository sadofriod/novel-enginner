import type { RuntimeRouteDefinition } from '../../types';

export const deleteCommentRoute: RuntimeRouteDefinition = {
  method: 'DELETE',
  pattern: '/comments/:commentId',
  handle: ({ api, params }) => api.handleDeleteComment(params['commentId'] ?? ''),
};

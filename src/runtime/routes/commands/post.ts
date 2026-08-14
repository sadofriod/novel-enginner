import type { RuntimeRouteDefinition } from '../types';

export const postCommandsRoute: RuntimeRouteDefinition = {
  method: 'POST',
  pattern: '/commands',
  handle: ({ api, request }) => api.handlePostCommand(request),
};

import type { RuntimeRouteDefinition } from '../../types';

export const getBootstrapSessionRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/bootstrap-sessions/:sessionId',
  handle: ({ api, params }) => api.handleGetBootstrapSession(params['sessionId'] as string),
};

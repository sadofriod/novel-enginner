import type { RuntimeRouteDefinition } from '../types';

export const getBootstrapSessionsRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/bootstrap-sessions',
  handle: ({ api }) => api.handleListBootstrapSessions(),
};

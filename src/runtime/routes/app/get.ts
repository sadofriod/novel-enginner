import type { RuntimeRouteDefinition } from '../types';

export const getAppRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/app',
  handle: ({ api, request }) => api.handleApp(request),
};

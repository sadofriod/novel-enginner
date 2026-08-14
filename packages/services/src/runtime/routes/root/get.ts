import type { RuntimeRouteDefinition } from '../types';

export const getRootRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/',
  handle: ({ api }) => api.handleRoot(),
};

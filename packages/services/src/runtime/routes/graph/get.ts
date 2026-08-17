import type { RuntimeRouteDefinition } from '../types';

export const getGraphRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/graph',
  handle: ({ api }) => api.handleGetGraph(),
};

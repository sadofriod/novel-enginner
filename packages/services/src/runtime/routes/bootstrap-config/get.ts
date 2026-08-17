import type { RuntimeRouteDefinition } from '../types';

export const getBootstrapConfigRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/bootstrap-config',
  handle: ({ api }) => api.handleGetBootstrapConfig(),
};
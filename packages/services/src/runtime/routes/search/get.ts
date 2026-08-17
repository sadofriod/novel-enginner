import type { RuntimeRouteDefinition } from '../types';

export const getSearchRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/search',
  handle: ({ api, request }) => api.handleSearch(request),
};

import type { RuntimeRouteDefinition } from '../types';

export const getArtifactsRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/artifacts',
  handle: ({ api }) => api.handleListArtifacts(),
};

import type { RuntimeRouteDefinition } from '../../../types';

export const getArtifactRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/artifacts/:artifactType/:targetId',
  handle: ({ api, params }) =>
    api.handleGetArtifact(params['artifactType'] as string, params['targetId'] as string),
};

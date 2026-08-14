import type { RuntimeRouteDefinition } from '../../../types';

export const getBootstrapSessionRevisionsRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/bootstrap-sessions/:sessionId/revisions',
  handle: ({ api, params }) => api.handleGetBootstrapSessionRevisions(params['sessionId'] as string),
};

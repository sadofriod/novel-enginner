import type { RuntimeRouteDefinition } from '../../../types';

export const getBootstrapSessionEvidenceRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/bootstrap-sessions/:sessionId/evidence',
  handle: ({ api, params }) => api.handleGetBootstrapSessionEvidence(params['sessionId'] as string),
};

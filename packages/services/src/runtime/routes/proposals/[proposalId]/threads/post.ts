import type { RuntimeRouteDefinition } from '../../../types';

export const postProposalThreadsRoute: RuntimeRouteDefinition = {
  method: 'POST',
  pattern: '/proposals/:proposalId/threads',
  handle: ({ api, params, request }) => api.handleCreateProposalThread(params['proposalId'] ?? '', request),
};

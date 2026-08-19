import type { RuntimeRouteDefinition } from '../../../types';

export const getProposalThreadsRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/proposals/:proposalId/threads',
  handle: ({ api, params }) => api.handleListProposalThreads(params['proposalId'] ?? ''),
};

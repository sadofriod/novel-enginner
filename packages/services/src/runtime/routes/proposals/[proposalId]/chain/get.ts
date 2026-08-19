import type { RuntimeRouteDefinition } from '../../../types';

export const getProposalChainRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/proposals/:proposalId/chain',
  handle: ({ api, params }) => api.handleGetProposalChain(params['proposalId'] ?? ''),
};

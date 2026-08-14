import type { RuntimeRouteDefinition } from '../../types';

export const getCommandRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/commands/:commandId',
  handle: ({ api, params }) => api.handleGetCommand(params['commandId'] as string),
};

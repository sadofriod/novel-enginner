import type { RuntimeRouteDefinition } from '../../../types';

export const postAppCommandRoute: RuntimeRouteDefinition = {
  method: 'POST',
  pattern: '/app/actions/command',
  handle: ({ api, request }) => api.handleWebCommandAction(request),
};

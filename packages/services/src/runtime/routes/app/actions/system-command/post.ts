import type { RuntimeRouteDefinition } from '../../../types';

export const postAppSystemCommandRoute: RuntimeRouteDefinition = {
  method: 'POST',
  pattern: '/app/actions/system-command',
  handle: ({ api, request }) => api.handleWebSystemCommand(request),
};
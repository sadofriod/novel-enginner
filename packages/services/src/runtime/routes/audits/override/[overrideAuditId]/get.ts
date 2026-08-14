import type { RuntimeRouteDefinition } from '../../../types';

export const getOverrideAuditRoute: RuntimeRouteDefinition = {
  method: 'GET',
  pattern: '/audits/override/:overrideAuditId',
  handle: ({ api, params }) => api.handleGetOverrideAudit(params['overrideAuditId'] ?? ''),
};
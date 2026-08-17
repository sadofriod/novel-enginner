import { describe, expect, test } from 'bun:test';

import { createChildLogger } from '../../../../common/logger';
import { RunEventBus } from '../../../event-bus';
import { RuntimeStore } from '../../../store';

import { createOverrideAuditHandlers } from './override-audits';
import type { RouteHandlerDeps } from './context';

function deps(): RouteHandlerDeps {
  return {
    options: {},
    store: new RuntimeStore(),
    eventBus: new RunEventBus(),
    logger: createChildLogger('routes'),
    getWorkspaceValidity: () => 'clean',
    persistAcceptedCommand: undefined,
    loadPersistedCommand: undefined,
    dispatchCommand: undefined,
    dispatchSyntheticReview: undefined,
    reSyncStateOptions: { getActiveRuns: () => [] },
  };
}

describe('override audit handlers', () => {
  test('reports persistence unavailable in test environments', async () => {
    const { handleGetOverrideAudit } = createOverrideAuditHandlers(deps());
    const response = await handleGetOverrideAudit('audit-1');

    expect(response.status).toBe(404);
  });
});

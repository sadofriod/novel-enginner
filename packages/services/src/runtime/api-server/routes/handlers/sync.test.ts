import { describe, expect, test } from 'bun:test';

import { createChildLogger } from '../../../../common/logger';
import { RunEventBus } from '../../../event-bus';
import { RuntimeStore } from '../../../store';

import { createSyncHandlers } from './sync';
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

describe('sync handlers', () => {
  test('handleSyncCommand rejects an unknown sync intent with 404', async () => {
    const { handleSyncCommand } = createSyncHandlers(deps());
    const request = new Request('http://local.test/sync/rebuild-graph', { method: 'POST' });

    const response = await handleSyncCommand('unknown-intent', request);

    expect(response.status).toBe(404);
  });
});

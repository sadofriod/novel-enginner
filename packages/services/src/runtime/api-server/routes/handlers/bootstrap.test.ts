import { describe, expect, test } from 'bun:test';

import { createChildLogger } from '../../../../common/logger';
import { RunEventBus } from '../../../event-bus';
import { RuntimeStore } from '../../../store';

import { createBootstrapHandlers } from './bootstrap';
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

describe('bootstrap handlers', () => {
  test('handleGetBootstrapConfig returns workspace defaults', async () => {
    const { handleGetBootstrapConfig } = createBootstrapHandlers(deps());
    const response = handleGetBootstrapConfig();

    expect(response.status).toBe(200);
    const config = await response.json() as { workspaceId: string; bookId: string };
    expect(config.workspaceId.length).toBeGreaterThan(0);
    expect(config.bookId.length).toBeGreaterThan(0);
  });

  test('handleGetBootstrapSession returns 404 for an unknown session', async () => {
    const { handleGetBootstrapSession } = createBootstrapHandlers(deps());
    const response = await handleGetBootstrapSession('session-unknown');

    expect(response.status).toBe(404);
  });
});

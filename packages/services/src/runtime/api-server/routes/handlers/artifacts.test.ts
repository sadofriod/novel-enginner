import { describe, expect, test } from 'bun:test';

import { createChildLogger } from '../../../../common/logger';
import { RunEventBus } from '../../../event-bus';
import { RuntimeStore } from '../../../store';

import { createArtifactHandlers } from './artifacts';
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

describe('artifact handlers', () => {
  test('handleGetArtifact returns 404 for an unknown artifact', () => {
    const { handleGetArtifact } = createArtifactHandlers(deps());

    expect(handleGetArtifact('chapter-outline', 'chapter-unknown').status).toBe(404);
  });

  test('handleListArtifacts returns an empty list for a fresh store', async () => {
    const { handleListArtifacts } = createArtifactHandlers(deps());
    const response = handleListArtifacts();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});

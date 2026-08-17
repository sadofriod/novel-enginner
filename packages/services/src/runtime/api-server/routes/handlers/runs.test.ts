import { describe, expect, test } from 'bun:test';

import { createChildLogger } from '../../../../common/logger';
import { RunEventBus } from '../../../event-bus';
import { RuntimeStore } from '../../../store';

import { createRunHandlers } from './runs';
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

describe('run handlers', () => {
  test('handleGetRun returns 404 for an unknown run', () => {
    const { handleGetRun } = createRunHandlers(deps());

    expect(handleGetRun('run-unknown').status).toBe(404);
  });

  test('handleRunStream establishes an SSE stream', () => {
    const { handleRunStream } = createRunHandlers(deps());
    const request = new Request('http://local.test/runs/run-1/stream');

    const response = handleRunStream('run-1', request);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
  });
});

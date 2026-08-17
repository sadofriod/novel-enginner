import { describe, expect, test } from 'bun:test';

import { createChildLogger } from '../../../../common/logger';
import { RunEventBus } from '../../../event-bus';
import { RuntimeStore } from '../../../store';

import { createRedirectHandlers } from './redirects';
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

describe('redirect handlers', () => {
  test('handleRoot redirects to the web app url', () => {
    const { handleRoot } = createRedirectHandlers(deps());
    const response = handleRoot();

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toContain('/app');
  });

  test('handleApp forwards search params to the web app url', () => {
    const { handleApp } = createRedirectHandlers(deps());
    const request = new Request('http://local.test/app?artifactType=chapter-outline&targetId=chapter-1');

    const response = handleApp(request);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toContain('artifactType=chapter-outline');
  });
});

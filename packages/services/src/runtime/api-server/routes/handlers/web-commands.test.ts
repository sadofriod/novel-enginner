import { describe, expect, test } from 'bun:test';

import { createChildLogger } from '../../../../common/logger';
import { RunEventBus } from '../../../event-bus';
import { RuntimeStore } from '../../../store';

import { createWebCommandHandlers } from './web-commands';
import type { CommandCrossReferences, RouteHandlerDeps } from './context';

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

function cross(): CommandCrossReferences {
  return {
    handlePostCommand: async () => new Response(null, { status: 202 }),
    handleSyncCommand: async () => new Response(null, { status: 202 }),
  };
}

describe('web command handlers', () => {
  test('handleWebCommandAction redirects back when required fields are missing', async () => {
    const { handleWebCommandAction } = createWebCommandHandlers(deps(), cross());
    const form = new FormData();
    form.set('redirectTo', '/app');
    const request = new Request('http://local.test/web/command', { method: 'POST', body: form });

    const response = await handleWebCommandAction(request);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/app');
  });

  test('handleWebSystemCommand redirects back when required fields are missing', async () => {
    const { handleWebSystemCommand } = createWebCommandHandlers(deps(), cross());
    const form = new FormData();
    form.set('redirectTo', '/app');
    const request = new Request('http://local.test/web/system-command', { method: 'POST', body: form });

    const response = await handleWebSystemCommand(request);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/app');
  });
});

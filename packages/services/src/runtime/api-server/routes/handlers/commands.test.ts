import { describe, expect, test } from 'bun:test';

import { createChildLogger } from '../../../../common/logger';
import { RunEventBus } from '../../../event-bus';
import { RuntimeStore } from '../../../store';

import { createCommandHandlers } from './commands';
import type { RouteHandlerDeps } from './context';

function deps(): RouteHandlerDeps {
  const store = new RuntimeStore();
  return {
    options: {},
    store,
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

const VALID_PAYLOAD = {
  workspaceId: 'ws-1',
  bookId: 'book-1',
  artifactType: 'chapter-outline',
  targetId: 'chapter-1',
  intent: 'propose',
  requestedBy: 'user-1',
  approvalMode: 'manual',
  idempotencyKey: 'key-1',
};

describe('command handlers', () => {
  test('handlePostCommand accepts a valid command with 202', async () => {
    const { handlePostCommand } = createCommandHandlers(deps());
    const request = new Request('http://local.test/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    const response = await handlePostCommand(request);

    expect(response.status).toBe(202);
    const body = await response.json() as { status: string };
    expect(body.status).toBe('accepted');
  });

  test('handlePostCommand rejects malformed JSON with 400', async () => {
    const { handlePostCommand } = createCommandHandlers(deps());
    const request = new Request('http://local.test/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });

    const response = await handlePostCommand(request);

    expect(response.status).toBe(400);
  });

  test('handleGetCommand returns 404 for an unknown command', async () => {
    const { handleGetCommand } = createCommandHandlers(deps());
    const response = handleGetCommand('cmd-unknown');

    expect(response.status).toBe(404);
  });
});

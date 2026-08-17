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

  test('handleWebCommandAction dispatches synthetic re-review after inline edit on an approved artifact', async () => {
    const dispatched: unknown[] = [];
    const store = new RuntimeStore();
    store.upsertArtifact({
      artifactType: 'character-update',
      targetId: 'char-mira',
      canonicalStatus: 'approved',
      proposalStatus: 'approved',
      activeProposalId: 'proposal-1',
      reviewStale: false,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const { handleWebCommandAction } = createWebCommandHandlers(
      { ...deps(), store, dispatchSyntheticReview: async (input) => { dispatched.push(input); } },
      cross(),
    );
    const form = new FormData();
    form.set('artifactType', 'character-update');
    form.set('targetId', 'char-mira');
    form.set('intent', 'edit');
    form.set('note', 'Tone down the shipwright foreshadowing.');
    const request = new Request('http://local.test/web/command', { method: 'POST', body: form });

    const response = await handleWebCommandAction(request);

    expect(response.status).toBe(303);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      workspaceId: 'workspace-local',
      bookId: 'book-local',
      artifactType: 'character-update',
      targetId: 'char-mira',
      editedFilePath: 'state/characters/char-mira.md',
      editedText: 'Tone down the shipwright foreshadowing.',
      proposalId: 'proposal-1',
    });
    const artifact = store.getArtifact('character-update', 'char-mira');
    expect(artifact?.reviewStale).toBe(true);
    expect(artifact?.inlineEditNote).toBe('Tone down the shipwright foreshadowing.');
  });

  test('handleWebCommandAction does not dispatch synthetic review for a non-approved artifact', async () => {
    const dispatched: unknown[] = [];
    const store = new RuntimeStore();
    store.upsertArtifact({
      artifactType: 'character-update',
      targetId: 'char-mira',
      canonicalStatus: 'draft',
      proposalStatus: 'pending-approval',
      reviewStale: false,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const { handleWebCommandAction } = createWebCommandHandlers(
      { ...deps(), store, dispatchSyntheticReview: async (input) => { dispatched.push(input); } },
      cross(),
    );
    const form = new FormData();
    form.set('artifactType', 'character-update');
    form.set('targetId', 'char-mira');
    form.set('intent', 'edit');
    form.set('note', 'Draft polish.');
    const request = new Request('http://local.test/web/command', { method: 'POST', body: form });

    const response = await handleWebCommandAction(request);

    expect(response.status).toBe(303);
    expect(dispatched).toHaveLength(0);
  });
});

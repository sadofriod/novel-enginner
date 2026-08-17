import { describe, expect, test } from 'bun:test';

import { createApiServer } from './api-server';
import { RuntimeStore } from './store';
import { reSyncState } from '../workspace/sync-engine';

const ENVELOPE_BASE = {
  workspaceId: 'workspace-author-propose',
  bookId: 'book-author-propose',
  requestedBy: 'author-local',
  approvalMode: 'manual' as const,
};

function postJson(fetch: (request: Request) => Promise<Response>, path: string, body: unknown): Promise<Response> {
  return fetch(
    new Request(`http://local.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('author-proposed artifact content', () => {
  test('creates a proposal and validated draft from frontmatter without agent dispatch', async () => {
    const store = new RuntimeStore();
    store.setLastKnownSnapshot(ENVELOPE_BASE.workspaceId, reSyncState([]).snapshot);
    const dispatched: string[] = [];
    const { fetch, store: apiStore, eventBus } = createApiServer({
      store,
      dispatchCommand: async (envelope) => {
        dispatched.push(envelope.intent);
      },
    });

    const response = await postJson(fetch, '/commands', {
      ...ENVELOPE_BASE,
      artifactType: 'character-update',
      targetId: 'char-mira',
      intent: 'propose',
      idempotencyKey: 'author-propose-char-001',
      frontmatter: {
        id: 'char-mira',
        name: 'Mira',
        status: 'active',
        coreMotivation: '寻找真相',
        worldview: '规则是为了被挑战',
        techLevel: '低科技',
      },
      body: '米拉在海港醒来。',
    });
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(dispatched).toEqual([]);

    const proposal = apiStore.getActiveProposal('character-update', 'char-mira');
    expect(proposal?.status).toBe('pending-review');
    expect(proposal?.basedOnCanonicalVersion).toBe(reSyncState([]).snapshot.snapshotId);

    const draft = apiStore.getCanonicalDraft(proposal?.proposalId ?? '');
    expect(draft?.relativePath).toBe('state/characters/char-mira.md');
    expect(draft?.content).toContain('id: char-mira');

    const types = eventBus.history(body.runId).map((event) => event.type);
    expect(types).toContain('artifact.proposed');
    expect(types).toContain('run.step.completed');
  });

  test('falls back to agent dispatch when no author content is provided', async () => {
    const store = new RuntimeStore();
    store.setLastKnownSnapshot('workspace-author-propose-dispatch', reSyncState([]).snapshot);
    const dispatched: string[] = [];
    const { fetch } = createApiServer({
      store,
      dispatchCommand: async (envelope) => {
        dispatched.push(envelope.intent);
      },
    });

    const response = await postJson(fetch, '/commands', {
      ...ENVELOPE_BASE,
      workspaceId: 'workspace-author-propose-dispatch',
      artifactType: 'chapter-outline',
      targetId: 'chapter-0042-outline',
      intent: 'propose',
      idempotencyKey: 'author-propose-dispatch-001',
    });
    expect(response.status).toBe(202);
    expect(dispatched).toEqual(['propose']);
  });

  test('publishes a failure event when author content fails canonical validation', async () => {
    const store = new RuntimeStore();
    store.setLastKnownSnapshot('workspace-author-propose-invalid', reSyncState([]).snapshot);
    const { fetch, eventBus } = createApiServer({ store });

    const response = await postJson(fetch, '/commands', {
      ...ENVELOPE_BASE,
      workspaceId: 'workspace-author-propose-invalid',
      artifactType: 'character-update',
      targetId: 'char-mira',
      intent: 'propose',
      idempotencyKey: 'author-propose-invalid-001',
      frontmatter: { id: 'char-mira' },
      body: '',
    });
    expect(response.status).toBe(202);
    const body = await response.json();
    const types = eventBus.history(body.runId).map((event) => event.type);
    expect(types).toContain('run.step.failed');
  });
});

import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';

import { createApiServer } from './api-server';
import { RuntimeStore } from './store';
import { reSyncState } from '../workspace/sync-engine';
import { serializeCanonicalMarkdown } from '../workspace/markdown';
import { generateProjectBriefProposal } from '../bootstrap/research/research-orchestrator';

const WORKSPACE_ID = 'workspace-bootstrap-chain';
const BOOK_ID = 'book-bootstrap-chain';
const SESSION_ID = 'bootstrap-chain-001';

function postJson(fetch: (request: Request) => Promise<Response>, path: string, body: unknown): Promise<Response> {
  return fetch(
    new Request(`http://local.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

let commandSequence = 0;

function createBootstrapCommand(intent: string, sessionId: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  commandSequence += 1;
  return {
    workspaceId: WORKSPACE_ID,
    bookId: BOOK_ID,
    systemTaskType: intent,
    intent,
    requestedBy: 'author-local',
    approvalMode: 'manual',
    idempotencyKey: `chain-${intent}-${sessionId}-${commandSequence}`,
    sessionId,
    ...extra,
  };
}

async function approveArtifact(fetch: (request: Request) => Promise<Response>, artifactType: string, targetId: string): Promise<Response> {
  commandSequence += 1;
  return postJson(fetch, '/commands', {
    workspaceId: WORKSPACE_ID,
    bookId: BOOK_ID,
    artifactType,
    targetId,
    intent: 'approve',
    requestedBy: 'author-local',
    approvalMode: 'manual',
    idempotencyKey: `chain-approve-${artifactType}-${targetId}-${commandSequence}`,
  });
}

describe('new-book bootstrap full chain (acceptance #11)', () => {
  test('advances through world-foundation, story-blueprint, volume, chapters to ready-to-write', async () => {
    const workspaceRoot = await mkdtemp('/tmp/novel-bootstrap-chain-root-');
    const store = new RuntimeStore();
    store.setLastKnownSnapshot(WORKSPACE_ID, reSyncState([]).snapshot);
    const { fetch, eventBus } = createApiServer({
      store,
      workspaceRoot,
      loadActiveProposal: async (_workspaceId, _bookId, artifactType, targetId) => store.getActiveProposal(artifactType, targetId),
      loadCanonicalDraft: async (proposalId) => store.getCanonicalDraft(proposalId),
    });

    try {
      const create = await postJson(fetch, '/commands', createBootstrapCommand('create-bootstrap-session', SESSION_ID, { path: 'new-book', bookName: 'Chain Novel' }));
      expect(create.status).toBe(202);
      expect((await postJson(fetch, '/commands', createBootstrapCommand('continue-bootstrap-session', SESSION_ID))).status).toBe(202);
      const decisions = { genre: '科幻', targetAudience: '青年读者', readerPromise: '紧张', corePremise: '在规则中自由', openingHook: '开场', contentBoundaries: '', format: '连载' };
      for (const round of [1, 2, 3, 4, 5]) {
        expect((await postJson(fetch, '/commands', createBootstrapCommand('submit-dialogue-round', SESSION_ID, { summary: `Round ${round}`, draft: decisions }))).status).toBe(202);
      }
      const continueResponse = await postJson(fetch, '/commands', createBootstrapCommand('continue-bootstrap-session', SESSION_ID));
      if (continueResponse.status !== 202) {
        console.error('continue2 body:', await continueResponse.text());
      }
      expect(continueResponse.status).toBe(202);
      expect(store.getBootstrapSession(SESSION_ID)).toMatchObject({ currentStage: 'project-brief', status: 'awaiting-approval' });

      // Approve the project brief → session advances to world-foundation.
      const brief = generateProjectBriefProposal({ bookId: BOOK_ID, decisions });
      let response = await approveArtifact(fetch, 'project-brief', brief.id);
      expect(response.status).toBe(202);
      expect(store.getBootstrapSession(SESSION_ID)).toMatchObject({ currentStage: 'world-foundation', status: 'advancing' });

      // World foundation: continue seeds a proposal, then approve advances to story-blueprint.
      expect((await postJson(fetch, '/commands', createBootstrapCommand('continue-bootstrap-session', SESSION_ID))).status).toBe(202);
      const worldTarget = `world-foundation-${BOOK_ID}`;
      expect(store.getActiveProposal('world-foundation', worldTarget)).toBeDefined();
      expect(store.getBootstrapSession(SESSION_ID)).toMatchObject({ currentStage: 'world-foundation', status: 'awaiting-approval' });
      response = await approveArtifact(fetch, 'world-foundation', worldTarget);
      expect(response.status).toBe(202);
      expect(store.getBootstrapSession(SESSION_ID)).toMatchObject({ currentStage: 'story-blueprint', status: 'advancing' });

      // Story blueprint → volume-outlines.
      expect((await postJson(fetch, '/commands', createBootstrapCommand('continue-bootstrap-session', SESSION_ID))).status).toBe(202);
      const blueprintTarget = `story-blueprint-${BOOK_ID}`;
      expect(store.getActiveProposal('story-blueprint', blueprintTarget)).toBeDefined();
      response = await approveArtifact(fetch, 'story-blueprint', blueprintTarget);
      expect(response.status).toBe(202);
      expect(store.getBootstrapSession(SESSION_ID)).toMatchObject({ currentStage: 'volume-outlines', status: 'advancing' });

      // Volume outline → chapter-outline-batch (default location committed alongside).
      expect((await postJson(fetch, '/commands', createBootstrapCommand('continue-bootstrap-session', SESSION_ID))).status).toBe(202);
      expect(store.getActiveProposal('volume-outline', 'volume-001')).toBeDefined();
      response = await approveArtifact(fetch, 'volume-outline', 'volume-001');
      expect(response.status).toBe(202);
      expect(store.getBootstrapSession(SESSION_ID)).toMatchObject({ currentStage: 'chapter-outline-batch', status: 'advancing' });
      expect(store.getLastKnownSnapshot(WORKSPACE_ID)?.entities.has('state/locations/location-main.md')).toBe(true);

      // Chapter outline batch: continue seeds 3 chapter outlines.
      expect((await postJson(fetch, '/commands', createBootstrapCommand('continue-bootstrap-session', SESSION_ID))).status).toBe(202);
      expect(store.getActiveProposal('chapter-outline', 'chapter-0001-outline')).toBeDefined();
      expect(store.getActiveProposal('chapter-outline', 'chapter-0002-outline')).toBeDefined();
      expect(store.getActiveProposal('chapter-outline', 'chapter-0003-outline')).toBeDefined();
      expect(store.getBootstrapSession(SESSION_ID)).toMatchObject({ currentStage: 'chapter-outline-batch', status: 'awaiting-approval' });

      // Approve chapter 1 → ready-to-write.
      response = await approveArtifact(fetch, 'chapter-outline', 'chapter-0001-outline');
      expect(response.status).toBe(202);
      expect(store.getBootstrapSession(SESSION_ID)).toMatchObject({ status: 'ready-to-write' });
      const runId = JSON.parse(await response.text()).runId;
      expect(eventBus.history(runId).map((event) => event.type)).toContain('bootstrap.ready-to-write');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

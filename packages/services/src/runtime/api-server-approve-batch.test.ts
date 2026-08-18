import { describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Proposal } from '../domain';
import { createApiServer } from './api-server';
import { RunEventBus } from './event-bus';
import { RuntimeStore } from './store';
import { reSyncState } from '../workspace/sync-engine';

const WORKSPACE_ID = 'workspace-batch-001';
const BOOK_ID = 'book-batch-001';

const VALID_CHAPTER_OUTLINE_MARKDOWN = `---
id: chapter-0001-outline
chapterNumber: 1
volumeId: volume-001
chapterType: progress
chapterTypeTags: [progress]
status: draft
targetWordCount: 1800
sceneSkeleton:
  - id: scene-0001-entry
    purpose: Enter the harbor
    locationId: location-harbor
    participantCharacterIds: [char-mira]
emotionCurveStageIds: [emotion-0001-1, emotion-0001-2, emotion-0001-3, emotion-0001-4]
---

# Outline

The chapter opens at the harbor.
`;

function postJson(fetch: (request: Request) => Promise<Response>, path: string, body: unknown): Promise<Response> {
  return fetch(
    new Request(`http://local.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    proposalId: 'proposal-batch-good-001',
    artifactType: 'chapter-outline',
    targetId: 'chapter-0001-outline',
    status: 'pending-approval',
    intent: 'propose',
    origin: 'author',
    basedOnCanonicalVersion: 'snap-0001',
    parentRunId: 'run-batch-good-001',
    ...overrides,
  };
}

describe('approve-batch command', () => {
  test('approves eligible proposals and reports ineligible ones without blocking the batch', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'novel-enginner-'));
    const store = new RuntimeStore();
    const snapshot = reSyncState([]).snapshot;
    store.setLastKnownSnapshot(WORKSPACE_ID, snapshot);

    const good = makeProposal();
    const stale = makeProposal({
      proposalId: 'proposal-batch-stale-001',
      targetId: 'chapter-0042-outline',
      basedOnCanonicalVersion: 'snap-0000',
      parentRunId: 'run-batch-stale-001',
    });
    store.saveProposal(good);
    store.saveProposal(stale);
    store.saveCanonicalDraft({
      proposalId: good.proposalId,
      relativePath: 'state/chapters/chapter-0001-outline.md',
      content: VALID_CHAPTER_OUTLINE_MARKDOWN,
    });

    const eventBus = new RunEventBus();
    const { fetch } = createApiServer({ store, eventBus, workspaceRoot });

    const response = await postJson(fetch, '/commands', {
      workspaceId: WORKSPACE_ID,
      bookId: BOOK_ID,
      intent: 'approve-batch',
      proposalIds: [good.proposalId, stale.proposalId],
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: 'cmd-batch-001',
    });
    const body = await response.json();
    expect(response.status).toBe(202);

    const events = eventBus.history(body.runId);
    expect(events.some((event) => event.type === 'artifact.canonical-committed' && event.data?.['proposalId'] === good.proposalId)).toBe(true);
    expect(events.some((event) => event.type === 'run.step.failed' && String(event.data?.['reason']).includes('stale'))).toBe(true);
    expect(store.getArtifact('chapter-outline', 'chapter-0001-outline')?.proposalStatus).toBe('approved');
    expect(store.getProposal(stale.proposalId)?.status).toBe('pending-approval');
  });

  test('rejects an approve-batch envelope without proposalIds', async () => {
    const store = new RuntimeStore();
    const eventBus = new RunEventBus();
    const { fetch } = createApiServer({ store, eventBus });

    const response = await postJson(fetch, '/commands', {
      workspaceId: WORKSPACE_ID,
      bookId: BOOK_ID,
      intent: 'approve-batch',
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: 'cmd-batch-invalid-001',
    });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.code).toBe('invalid-command-envelope');
  });
});

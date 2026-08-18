import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createApiServer } from './api-server';
import { RunEventBus } from './event-bus';
import { RuntimeStore } from './store';

const CHAPTER_OUTLINE = `---
id: chapter-0001-outline
chapterNumber: 1
volumeId: volume-001
chapterType: progress
chapterTypeTags: [progress]
status: approved
targetWordCount: 1800
sceneSkeleton:
  - id: scene-0001-entry
    purpose: Enter the harbor
    locationId: location-harbor
    participantCharacterIds: []
emotionCurveStageIds: [emotion-0001-1, emotion-0001-2, emotion-0001-3, emotion-0001-4]
---

# Outline
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

describe('retrospective-review command', () => {
  test('creates pending-approval imported proposals for existing canonical content', async () => {
    const workspaceRoot = await mkdtemp(join('/tmp', 'novel-retro-'));
    await mkdir(join(workspaceRoot, 'state/chapters'), { recursive: true });
    await writeFile(join(workspaceRoot, 'state/chapters/chapter-0001-outline.md'), CHAPTER_OUTLINE);

    const store = new RuntimeStore();
    const eventBus = new RunEventBus();
    const { fetch } = createApiServer({ store, eventBus, workspaceRoot });

    try {
      const response = await postJson(fetch, '/commands', {
        workspaceId: 'workspace-retro-001',
        bookId: 'book-retro-001',
        systemTaskType: 'retrospective-review',
        intent: 'retrospective-review',
        requestedBy: 'author-local',
        approvalMode: 'manual',
        idempotencyKey: 'retro-001',
      });
      expect(response.status).toBe(202);
      const body = await response.json();

      const events = eventBus.history(body.runId);
      expect(events.some((event) => event.type === 'retrospective-review.completed' && event.data?.['proposalCount'] === 1)).toBe(true);
      const proposal = store.getProposal(`proposal-${body.runId}-1`);
      expect(proposal).toMatchObject({
        artifactType: 'chapter-outline',
        targetId: 'chapter-0001-outline',
        status: 'pending-approval',
        intent: 'propose',
        origin: 'imported',
      });
      const draft = store.getCanonicalDraft(`proposal-${body.runId}-1`);
      expect(draft?.relativePath).toBe('state/chapters/chapter-0001-outline.md');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('rejects a retrospective-review envelope without systemTaskType', async () => {
    const { fetch } = createApiServer({ store: new RuntimeStore(), eventBus: new RunEventBus() });
    const response = await postJson(fetch, '/commands', {
      workspaceId: 'workspace-retro-002',
      bookId: 'book-retro-002',
      intent: 'retrospective-review',
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: 'retro-002',
    });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('invalid-command-envelope');
  });
});

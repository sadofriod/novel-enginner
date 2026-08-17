import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Proposal } from '../domain';
import { createApiServer } from './api-server';
import { RunEventBus } from './event-bus';
import { RuntimeStore } from './store';
import { parseCanonicalMarkdown } from '../workspace/markdown';
import { reSyncState } from '../workspace/sync-engine';

const BASE_ENVELOPE = {
  workspaceId: 'workspace-cybernovel-001',
  bookId: 'book-quantum-ascension',
  artifactType: 'chapter-outline',
  targetId: 'chapter-0042-outline',
  intent: 'propose',
  requestedBy: 'author-local',
  approvalMode: 'manual',
  idempotencyKey: 'cmd-20260812-001',
};

const VALID_CHAPTER_OUTLINE_MARKDOWN = `---
id: chapter-0042-outline
chapterNumber: 42
volumeId: volume-001
chapterType: progress
chapterTypeTags: [progress]
status: draft
targetWordCount: 1800
sceneSkeleton:
  - id: scene-0042-entry
    purpose: Enter the ruined laboratory
    locationId: location-ruined-lab
    participantCharacterIds: [char-lin-mo]
emotionCurveStageIds: [emotion-0042-1, emotion-0042-2, emotion-0042-3, emotion-0042-4]
---

# Outline

The chapter advances the investigation.
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

describe('command envelope validation', () => {
  test('emits an exported artifact event for export-draft decisions', async () => {
    const store = new RuntimeStore();
    const snapshot = reSyncState([]).snapshot;
    const eventBus = new RunEventBus();
    store.setLastKnownSnapshot(BASE_ENVELOPE.workspaceId, snapshot);
    const { fetch } = createApiServer({
      store,
      eventBus,
      loadActiveProposal: async () => ({
        proposalId: 'proposal-export-001', artifactType: 'chapter-outline', targetId: 'chapter-0042-outline', status: 'pending-approval', intent: 'propose', basedOnCanonicalVersion: snapshot.snapshotId, parentRunId: 'run-export-001',
      }),
    });
    const response = await postJson(fetch, '/commands', { ...BASE_ENVELOPE, intent: 'export-draft', idempotencyKey: 'cmd-export-001' });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(eventBus.history(body.runId).at(-1)?.type).toBe('artifact.exported');
    expect(store.getArtifact('chapter-outline', 'chapter-0042-outline')?.proposalStatus).toBe('exported');
  });

  test('queues a dirty-workspace approval for explicit confirmation after re-sync', async () => {
    const store = new RuntimeStore();
    const snapshot = reSyncState([]).snapshot;
    const proposal = {
      proposalId: 'proposal-chapter-0042-waiting-sync',
      artifactType: 'chapter-outline' as const,
      targetId: 'chapter-0042-outline',
      status: 'pending-approval' as const,
      intent: 'propose' as const,
      basedOnCanonicalVersion: snapshot.snapshotId,
      parentRunId: 'run-proposal-waiting-sync',
    };
    const eventBus = new RunEventBus();
    const persistedStatuses: string[] = [];
    store.setLastKnownSnapshot(BASE_ENVELOPE.workspaceId, snapshot);
    const { fetch } = createApiServer({
      store,
      eventBus,
      getWorkspaceValidity: () => 'dirty',
      loadActiveProposal: async () => proposal,
      persistProposalDecision: async (_workspaceId, _bookId, persistedProposal) => {
        persistedStatuses.push(persistedProposal.status);
      },
    });

    const response = await postJson(fetch, '/commands', {
      ...BASE_ENVELOPE,
      intent: 'approve',
      idempotencyKey: 'cmd-approval-waiting-sync-001',
    });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(persistedStatuses).toEqual(['waiting-sync']);
    expect(store.getArtifact('chapter-outline', 'chapter-0042-outline')).toMatchObject({
      proposalStatus: 'waiting-sync',
      canonicalStatus: 'draft',
    });
    expect(eventBus.history(body.runId).at(-1)?.type).toBe('artifact.commit-blocked');
  });

  test('commits only after a clean-workspace approval confirms a waiting-sync proposal', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'novel-enginner-'));
    const store = new RuntimeStore();
    const snapshot = reSyncState([]).snapshot;
    let workspaceValidity: 'clean' | 'dirty' = 'dirty';
    let proposal: Proposal = {
      proposalId: 'proposal-chapter-0042-confirm-after-sync',
      artifactType: 'chapter-outline',
      targetId: 'chapter-0042-outline',
      status: 'pending-approval',
      intent: 'propose',
      basedOnCanonicalVersion: snapshot.snapshotId,
      parentRunId: 'run-proposal-confirm-after-sync',
    };
    const eventBus = new RunEventBus();
    store.setLastKnownSnapshot(BASE_ENVELOPE.workspaceId, snapshot);
    store.saveCanonicalDraft({
      proposalId: proposal.proposalId,
      relativePath: 'state/chapters/chapter-0042-outline.md',
      content: VALID_CHAPTER_OUTLINE_MARKDOWN,
    });
    const { fetch } = createApiServer({
      store,
      eventBus,
      workspaceRoot,
      getWorkspaceValidity: () => workspaceValidity,
      loadActiveProposal: async () => proposal,
      persistProposalDecision: async (_workspaceId, _bookId, persistedProposal) => {
        proposal = persistedProposal;
      },
    });

    try {
      const queued = await postJson(fetch, '/commands', {
        ...BASE_ENVELOPE,
        intent: 'approve',
        idempotencyKey: 'cmd-approval-confirm-queued-001',
      });
      const queuedBody = await queued.json();
      expect(queued.status).toBe(202);
      expect(proposal.status).toBe('waiting-sync');
      expect(eventBus.history(queuedBody.runId).at(-1)?.type).toBe('artifact.commit-blocked');

      workspaceValidity = 'clean';
      const confirmed = await postJson(fetch, '/commands', {
        ...BASE_ENVELOPE,
        intent: 'approve',
        idempotencyKey: 'cmd-approval-confirm-clean-001',
      });
      const confirmedBody = await confirmed.json();
      expect(confirmed.status).toBe(202);
      expect(proposal.status).toBe('approved');
      expect(eventBus.history(confirmedBody.runId).at(-1)?.type).toBe('artifact.canonical-committed');
      expect(parseCanonicalMarkdown(
        await readFile(join(workspaceRoot, 'state/chapters/chapter-0042-outline.md'), 'utf8'),
      ).frontmatter).toMatchObject({ id: 'chapter-0042-outline', status: 'approved' });
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

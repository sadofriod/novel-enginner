import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

const VALID_TECH_RULE_MARKDOWN = `---
id: tech-tide-clock
name: Tide Clock
tier: foundational
preconditions: []
costs: []
limits: []
allowedEffects: []
status: active
---

# Rule

The tide clock governs harbor ebb and flow.
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
  test('commits an approved proposal draft to the canonical workspace', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'novel-enginner-'));
    const store = new RuntimeStore();
    const snapshot = reSyncState([]).snapshot;
    const proposal = {
      proposalId: 'proposal-chapter-0042-001',
      artifactType: 'chapter-outline' as const,
      targetId: 'chapter-0042-outline',
      status: 'pending-approval' as const,
      intent: 'propose' as const,
      basedOnCanonicalVersion: snapshot.snapshotId,
      parentRunId: 'run-proposal-001',
    };
    const content = VALID_CHAPTER_OUTLINE_MARKDOWN;
    store.setLastKnownSnapshot(BASE_ENVELOPE.workspaceId, snapshot);
    store.saveCanonicalDraft({
      proposalId: proposal.proposalId,
      relativePath: 'state/chapters/chapter-0042-outline.md',
      content,
    });
    const { fetch } = createApiServer({
      store,
      workspaceRoot,
      loadActiveProposal: async () => proposal,
    });

    try {
      const response = await postJson(fetch, '/commands', {
        ...BASE_ENVELOPE,
        intent: 'approve',
        idempotencyKey: 'cmd-commit-canonical-001',
      });

      expect(response.status).toBe(202);
      const written = parseCanonicalMarkdown(
        await readFile(join(workspaceRoot, 'state/chapters/chapter-0042-outline.md'), 'utf8'),
      );
      expect(written.frontmatter).toMatchObject({ id: 'chapter-0042-outline', status: 'approved' });
      expect(written.sections.get('Outline')).toBe('The chapter advances the investigation.');
      expect(store.getArtifact('chapter-outline', 'chapter-0042-outline')).toMatchObject({
        proposalStatus: 'approved',
        canonicalStatus: 'approved',
      });
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('commits bundled canonical drafts atomically with the approved proposal', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'novel-enginner-'));
    const store = new RuntimeStore();
    const snapshot = reSyncState([]).snapshot;
    const proposal = {
      proposalId: 'proposal-chapter-0042-bundle-001',
      artifactType: 'chapter-outline' as const,
      targetId: 'chapter-0042-outline',
      status: 'pending-approval' as const,
      intent: 'propose' as const,
      basedOnCanonicalVersion: snapshot.snapshotId,
      parentRunId: 'run-proposal-bundle-001',
      bundledDiffRefs: ['draft-character-mira-bundle-001'],
    };
    store.setLastKnownSnapshot(BASE_ENVELOPE.workspaceId, snapshot);
    store.saveCanonicalDraft({
      proposalId: proposal.proposalId,
      relativePath: 'state/chapters/chapter-0042-outline.md',
      content: VALID_CHAPTER_OUTLINE_MARKDOWN,
    });
    store.saveCanonicalDraft({
      proposalId: 'draft-character-mira-bundle-001',
      relativePath: 'state/characters/char-mira.md',
      content: '---\nid: char-mira\nname: Mira\n---\n',
    });
    const { fetch } = createApiServer({
      store,
      workspaceRoot,
      loadActiveProposal: async () => proposal,
    });

    try {
      const response = await postJson(fetch, '/commands', {
        ...BASE_ENVELOPE,
        intent: 'approve',
        idempotencyKey: 'cmd-commit-canonical-bundle-001',
      });

      expect(response.status).toBe(202);
      expect(await readFile(join(workspaceRoot, 'state/chapters/chapter-0042-outline.md'), 'utf8'))
        .toContain('status: approved');
      expect(await readFile(join(workspaceRoot, 'state/characters/char-mira.md'), 'utf8'))
        .toContain('id: char-mira');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('keeps approval retryable when a bundled canonical draft is unavailable', async () => {
    const store = new RuntimeStore();
    const snapshot = reSyncState([]).snapshot;
    const proposal = {
      proposalId: 'proposal-chapter-0042-missing-bundle-001',
      artifactType: 'chapter-outline' as const,
      targetId: 'chapter-0042-outline',
      status: 'pending-approval' as const,
      intent: 'propose' as const,
      basedOnCanonicalVersion: snapshot.snapshotId,
      parentRunId: 'run-proposal-missing-bundle-001',
      bundledDiffRefs: ['draft-character-missing-001'],
    };
    store.setLastKnownSnapshot(BASE_ENVELOPE.workspaceId, snapshot);
    store.saveCanonicalDraft({
      proposalId: proposal.proposalId,
      relativePath: 'state/chapters/chapter-0042-outline.md',
      content: VALID_CHAPTER_OUTLINE_MARKDOWN,
    });
    const { fetch, eventBus } = createApiServer({
      store,
      loadActiveProposal: async () => proposal,
    });

    const response = await postJson(fetch, '/commands', {
      ...BASE_ENVELOPE,
      intent: 'approve',
      idempotencyKey: 'cmd-commit-missing-bundle-001',
    });
    const body = await response.json();

    expect(response.status).toBe(202);
    const types = eventBus.history(body.runId).map((event) => event.type);
    expect(types).toContain('run.step.failed');
    expect(types).toContain('artifact.commit-failed');
    expect(eventBus.history(body.runId).at(-1)?.type).toBe('artifact.commit-failed');
    expect(eventBus.history(body.runId).at(-1)?.data).toMatchObject({ recoverable: true });
  });

  test('loads a canonical draft from the configured repository before approval commits', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'novel-enginner-'));
    const store = new RuntimeStore();
    const snapshot = reSyncState([]).snapshot;
    const proposal = {
      proposalId: 'proposal-chapter-0042-persisted-draft',
      artifactType: 'chapter-outline' as const,
      targetId: 'chapter-0042-outline',
      status: 'pending-approval' as const,
      intent: 'propose' as const,
      basedOnCanonicalVersion: snapshot.snapshotId,
      parentRunId: 'run-proposal-persisted-draft',
    };
    const content = VALID_CHAPTER_OUTLINE_MARKDOWN;
    store.setLastKnownSnapshot(BASE_ENVELOPE.workspaceId, snapshot);
    const { fetch } = createApiServer({
      store,
      workspaceRoot,
      loadActiveProposal: async () => proposal,
      loadCanonicalDraft: async () => ({
        proposalId: proposal.proposalId,
        relativePath: 'state/chapters/chapter-0042-outline.md',
        content,
      }),
    });

    try {
      const response = await postJson(fetch, '/commands', {
        ...BASE_ENVELOPE,
        intent: 'approve',
        idempotencyKey: 'cmd-commit-canonical-persisted-draft',
      });

      expect(response.status).toBe(202);
      const written = parseCanonicalMarkdown(
        await readFile(join(workspaceRoot, 'state/chapters/chapter-0042-outline.md'), 'utf8'),
      );
      expect(written.frontmatter).toMatchObject({ id: 'chapter-0042-outline', status: 'approved' });
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('explicitly re-syncs the workspace after a successful commit', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'novel-enginner-'));
    const store = new RuntimeStore();
    const snapshot = reSyncState([]).snapshot;
    const proposal = {
      proposalId: 'proposal-tech-rule-001',
      artifactType: 'tech-rule-update' as const,
      targetId: 'tech-tide-clock',
      status: 'pending-approval' as const,
      intent: 'propose' as const,
      basedOnCanonicalVersion: snapshot.snapshotId,
      parentRunId: 'run-proposal-tech-rule-001',
    };
    store.setLastKnownSnapshot(BASE_ENVELOPE.workspaceId, snapshot);
    store.saveCanonicalDraft({
      proposalId: proposal.proposalId,
      relativePath: 'state/tech-rules/tech-tide-clock.md',
      content: VALID_TECH_RULE_MARKDOWN,
    });
    const { fetch, store: apiStore } = createApiServer({
      store,
      workspaceRoot,
      loadActiveProposal: async () => proposal,
    });

    try {
      const response = await postJson(fetch, '/commands', {
        workspaceId: BASE_ENVELOPE.workspaceId,
        bookId: BASE_ENVELOPE.bookId,
        artifactType: 'tech-rule-update',
        targetId: 'tech-tide-clock',
        intent: 'approve',
        requestedBy: 'author-local',
        approvalMode: 'manual',
        idempotencyKey: 'cmd-commit-tech-rule-001',
      });
      expect(response.status).toBe(202);

      const snapshotAfter = apiStore.getLastKnownSnapshot(BASE_ENVELOPE.workspaceId);
      expect(snapshotAfter?.entities.has('state/tech-rules/tech-tide-clock.md')).toBe(true);
      expect(snapshotAfter?.snapshotId).not.toBe(snapshot.snapshotId);
      // The freshly committed file is new to the engine, so it is pending
      // acknowledgement (`dirty`) rather than `clean`, but it is not `invalid`.
      expect(apiStore.getWorkspaceValidity(BASE_ENVELOPE.workspaceId)).toBe('dirty');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('keeps an approval retryable when its canonical draft is unavailable', async () => {
    const store = new RuntimeStore();
    const snapshot = reSyncState([]).snapshot;
    const proposal = {
      proposalId: 'proposal-chapter-0042-missing-draft',
      artifactType: 'chapter-outline' as const,
      targetId: 'chapter-0042-outline',
      status: 'pending-approval' as const,
      intent: 'propose' as const,
      basedOnCanonicalVersion: snapshot.snapshotId,
      parentRunId: 'run-proposal-missing-draft',
    };
    store.setLastKnownSnapshot(BASE_ENVELOPE.workspaceId, snapshot);
    const eventBus = new RunEventBus();
    const persistedStatuses: string[] = [];
    const { fetch } = createApiServer({
      store,
      eventBus,
      loadActiveProposal: async () => proposal,
      persistProposalDecision: async (_workspaceId, _bookId, persistedProposal) => {
        persistedStatuses.push(persistedProposal.status);
      },
    });

    const response = await postJson(fetch, '/commands', {
      ...BASE_ENVELOPE,
      intent: 'approve',
      idempotencyKey: 'cmd-commit-canonical-missing-draft',
    });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(store.getArtifact('chapter-outline', 'chapter-0042-outline')).toMatchObject({
      proposalStatus: 'approved',
      canonicalStatus: 'draft',
    });
    expect(persistedStatuses).toEqual(['approved']);
    const lastEvent = eventBus.history(body.runId).at(-1);
    expect(lastEvent?.type).toBe('artifact.commit-failed');
    expect(lastEvent?.data).toMatchObject({
      recoverable: true,
      reason: 'canonical draft not found for proposal proposal-chapter-0042-missing-draft',
    });
  });
});

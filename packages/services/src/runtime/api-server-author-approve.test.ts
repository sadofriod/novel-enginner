import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApiServer } from './api-server';
import { RuntimeStore } from './store';
import { parseCanonicalMarkdown } from '../workspace/markdown';
import { reSyncState } from '../workspace/sync-engine';

const ENVELOPE_BASE = {
  workspaceId: 'workspace-author-approve',
  bookId: 'book-author-approve',
  requestedBy: 'author-local',
  approvalMode: 'manual' as const,
};

/** Paragraph within the 50–150 char rule-gate range so the auto-review passes. */
const COMPLIANT_PROSE =
  '凯蹲在老周的旧货摊前，手指划过废弃的生物电极组件，细如发丝的金属导线在昏暗灯光下泛着暗淡银光，空气中弥漫着金属锈蚀与旧电路板受潮的气味。';

const CHAPTER_OUTLINE_FRONTMATTER = {
  id: 'chapter-0042-outline',
  chapterNumber: 42,
  volumeId: 'volume-001',
  chapterType: 'progress',
  chapterTypeTags: ['progress'],
  status: 'draft',
  targetWordCount: 1800,
  sceneSkeleton: [
    {
      id: 'scene-0042-entry',
      purpose: 'Enter the ruined laboratory',
      locationId: 'location-ruined-lab',
      participantCharacterIds: ['char-lin-mo'],
    },
  ],
  emotionCurveStageIds: ['emotion-0042-1', 'emotion-0042-2', 'emotion-0042-3', 'emotion-0042-4'],
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

function outlineEnvelope(intent: 'propose' | 'approve', idempotencyKey: string) {
  return {
    ...ENVELOPE_BASE,
    artifactType: 'chapter-outline',
    targetId: 'chapter-0042-outline',
    intent,
    idempotencyKey,
  };
}

function proposeBody(prose: string, idempotencyKey: string) {
  return {
    ...outlineEnvelope('propose', idempotencyKey),
    frontmatter: CHAPTER_OUTLINE_FRONTMATTER,
    sections: { Outline: prose },
  };
}

describe('author-local propose → auto-review → approve', () => {
  test('commits an approved proposal whose rule-gate review passed', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'novel-enginner-author-approve-'));
    const store = new RuntimeStore();
    store.setLastKnownSnapshot(ENVELOPE_BASE.workspaceId, reSyncState([]).snapshot);
    const { fetch, store: apiStore, eventBus } = createApiServer({ store, workspaceRoot });

    try {
      const propose = await postJson(fetch, '/commands', proposeBody(COMPLIANT_PROSE, 'author-approve-pass-propose-001'));
      expect(propose.status).toBe(202);
      const proposeRun = await propose.json();

      const proposal = apiStore.getActiveProposal('chapter-outline', 'chapter-0042-outline');
      expect(proposal?.status).toBe('pending-approval');
      expect(proposal?.latestReviewResultId).toBeDefined();
      const review = apiStore.getReviewerResult(proposal?.latestReviewResultId ?? '');
      expect(review?.approved).toBe(true);
      // The queue reflects the real proposal state, not a hardcoded value.
      expect(apiStore.getArtifact('chapter-outline', 'chapter-0042-outline')?.proposalStatus).toBe('pending-approval');

      const approve = await postJson(fetch, '/commands', outlineEnvelope('approve', 'author-approve-pass-approve-001'));
      expect(approve.status).toBe(202);
      const approveRun = await approve.json();

      const types = eventBus.history(approveRun.runId).map((event) => event.type);
      expect(types).toContain('artifact.canonical-committed');

      const written = parseCanonicalMarkdown(
        await readFile(join(workspaceRoot, 'state/chapters/chapter-0042-outline.md'), 'utf8'),
      );
      expect(written.frontmatter).toMatchObject({ id: 'chapter-0042-outline', status: 'approved' });
      expect(apiStore.getArtifact('chapter-outline', 'chapter-0042-outline')).toMatchObject({
        proposalStatus: 'approved',
        canonicalStatus: 'approved',
      });
      expect(proposeRun.runId).not.toBe(approveRun.runId);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('blocks approval with a visible reason when the rule-gate review failed', async () => {
    const store = new RuntimeStore();
    store.setLastKnownSnapshot(ENVELOPE_BASE.workspaceId, reSyncState([]).snapshot);
    const { fetch, store: apiStore, eventBus } = createApiServer({ store });

    const propose = await postJson(fetch, '/commands', proposeBody('太短了。', 'author-approve-fail-propose-001'));
    expect(propose.status).toBe(202);
    const proposeRun = await propose.json();

    const proposal = apiStore.getActiveProposal('chapter-outline', 'chapter-0042-outline');
    expect(proposal?.status).toBe('pending-approval');
    const review = apiStore.getReviewerResult(proposal?.latestReviewResultId ?? '');
    expect(review?.approved).toBe(false);
    expect(review?.hardFailures.some((failure) => failure.code === 'paragraph-length-violation')).toBe(true);

    const approve = await postJson(fetch, '/commands', outlineEnvelope('approve', 'author-approve-fail-approve-001'));
    expect(approve.status).toBe(202);
    const approveRun = await approve.json();

    // The rejection must be visible in the run trace, not silently swallowed, and
    // name the specific rule that failed so the author knows what to fix.
    const failed = eventBus.history(approveRun.runId).find((event) => event.type === 'run.step.failed');
    expect(failed?.data?.['reason']).toContain('latest review was rejected');
    expect(failed?.data?.['reason']).toContain('paragraph-length-violation');
    // The proposal stays queued so the author can override or re-propose.
    expect(apiStore.getActiveProposal('chapter-outline', 'chapter-0042-outline')?.status).toBe('pending-approval');
    expect(apiStore.getArtifact('chapter-outline', 'chapter-0042-outline')?.proposalStatus).toBe('pending-approval');
    expect(proposeRun.runId).not.toBe(approveRun.runId);
  });
});

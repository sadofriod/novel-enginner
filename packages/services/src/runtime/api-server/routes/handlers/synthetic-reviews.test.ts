import { describe, expect, test } from 'bun:test';

import { createChildLogger } from '../../../../common/logger';
import { assembleReviewerResult } from '../../../../agent/reviewer';
import { RunEventBus } from '../../../event-bus';
import { RuntimeStore } from '../../../store';

import type { RouteHandlerDeps } from './context';
import { createSyntheticReviewHandlers } from './synthetic-reviews';

function deps(overrides: Partial<RouteHandlerDeps> = {}): RouteHandlerDeps {
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
    ...overrides,
  };
}

function blockedReviewerResult() {
  return assembleReviewerResult(
    'A stable paragraph that passes every rule bundle while remaining long enough for the deterministic length rule to accept it.',
    { hardFailures: [{ code: 'clue-payoff-conflict', message: 'Clue never pays off.' }], dimensionScores: { antiAiVoice: 90, webFictionPacing: 90, emotionCurve: 60, characterConsistency: 90, settingConsistency: 90, clueCausality: 90, readabilityLayout: 90, languageTexture: 90 }, rewriteDirectives: [] },
  );
}

describe('synthetic review outcome handler', () => {
  test('applies a blocked outcome and reports the downstream gate as blocked', async () => {
    const store = new RuntimeStore();
    store.upsertArtifact({
      artifactType: 'chapter-manuscript',
      targetId: 'chapter-0042',
      canonicalStatus: 'approved',
      proposalStatus: 'approved',
      reviewStale: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const { handleSyntheticReviewOutcome } = createSyntheticReviewHandlers(deps({ store }));
    const response = await handleSyntheticReviewOutcome(new Request('http://local.test/review/synthetic-outcome', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId: 'workspace-local', bookId: 'book-local', artifactType: 'chapter-manuscript', targetId: 'chapter-0042', status: 'blocked', reviewerResult: blockedReviewerResult() }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json() as { readonly status: string; readonly blocked: boolean };
    expect(body.status).toBe('accepted');
    expect(body.blocked).toBe(true);
    expect(store.getArtifact('chapter-manuscript', 'chapter-0042')?.reviewBlocked).toBe(true);
  });

  test('applies a passed outcome and clears the downstream gate', async () => {
    const store = new RuntimeStore();
    store.upsertArtifact({
      artifactType: 'chapter-manuscript',
      targetId: 'chapter-0042',
      canonicalStatus: 'approved',
      proposalStatus: 'approved',
      reviewStale: true,
      reviewBlocked: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const { handleSyntheticReviewOutcome } = createSyntheticReviewHandlers(deps({ store }));
    const response = await handleSyntheticReviewOutcome(new Request('http://local.test/review/synthetic-outcome', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId: 'workspace-local', bookId: 'book-local', artifactType: 'chapter-manuscript', targetId: 'chapter-0042', status: 'passed' }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json() as { readonly status: string; readonly blocked: boolean };
    expect(body.status).toBe('accepted');
    expect(body.blocked).toBe(false);
    expect(store.getArtifact('chapter-manuscript', 'chapter-0042')?.reviewBlocked).toBe(false);
  });

  test('rejects a payload with an invalid reviewerResult', async () => {
    const { handleSyntheticReviewOutcome } = createSyntheticReviewHandlers(deps());
    const response = await handleSyntheticReviewOutcome(new Request('http://local.test/review/synthetic-outcome', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ artifactType: 'chapter-manuscript', targetId: 'chapter-0042', status: 'blocked', reviewerResult: { approved: false } }),
    }));

    expect(response.status).toBe(400);
  });

  test('rejects a payload missing required fields', async () => {
    const { handleSyntheticReviewOutcome } = createSyntheticReviewHandlers(deps());
    const response = await handleSyntheticReviewOutcome(new Request('http://local.test/review/synthetic-outcome', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'passed' }),
    }));

    expect(response.status).toBe(400);
  });
});

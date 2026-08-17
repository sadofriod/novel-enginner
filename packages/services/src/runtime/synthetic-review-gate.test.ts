import { describe, expect, test } from 'bun:test';

import { assembleReviewerResult } from '../agent/reviewer';
import type { DimensionScores } from '../domain/schema';
import { reSyncState } from '../workspace/sync-engine';

import { RuntimeStore } from './store';
import { applySyntheticReviewOutcome, isDownstreamAutoFlowBlocked } from './synthetic-review-gate';

const PASSING_SCORES: DimensionScores = {
  antiAiVoice: 90,
  webFictionPacing: 90,
  emotionCurve: 90,
  characterConsistency: 90,
  settingConsistency: 90,
  clueCausality: 90,
  readabilityLayout: 90,
  languageTexture: 90,
};

const LONG_PARAGRAPH = 'A stable paragraph that passes every rule bundle while remaining long enough for the deterministic length rule to accept it.';

const MANUSCRIPT = `---
id: chapter-0042
volumeId: volume-001
status: draft
---

# Chapter 42

${LONG_PARAGRAPH}
`;

function blockedReview() {
  return assembleReviewerResult(
    LONG_PARAGRAPH,
    { hardFailures: [{ code: 'clue-payoff-conflict', message: 'Clue never pays off.' }], dimensionScores: { ...PASSING_SCORES, emotionCurve: 60 }, rewriteDirectives: [] },
  );
}

function exemptibleReview() {
  return assembleReviewerResult(
    LONG_PARAGRAPH,
    { hardFailures: [{ code: 'exposition-overload', message: 'Exposition is overloaded.' }], dimensionScores: { ...PASSING_SCORES, emotionCurve: 60 }, rewriteDirectives: [] },
  );
}

function storeWithHandEditedManuscript(): RuntimeStore {
  const store = new RuntimeStore();
  store.upsertArtifact({
    artifactType: 'chapter-manuscript',
    targetId: 'chapter-0042',
    canonicalStatus: 'approved',
    proposalStatus: 'approved',
    reviewStale: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  return store;
}

describe('synthetic review gate', () => {
  test('a blocked synthetic review blocks downstream without rolling back canonical', () => {
    const store = storeWithHandEditedManuscript();
    const initial = reSyncState([{ path: 'manuscript/volume-001/chapter-0042.md', content: MANUSCRIPT }]);
    store.setLastKnownSnapshot('workspace-local', initial.snapshot);

    applySyntheticReviewOutcome(store, 'chapter-manuscript', 'chapter-0042', { status: 'blocked', reviewerResult: blockedReview() });

    const artifact = store.getArtifact('chapter-manuscript', 'chapter-0042');
    expect(artifact?.reviewBlocked).toBe(true);
    expect(artifact?.reviewStale).toBe(false);
    expect(isDownstreamAutoFlowBlocked(store, 'chapter-manuscript', 'chapter-0042')).toBe(true);
    const snapshot = store.getLastKnownSnapshot('workspace-local');
    expect(snapshot?.entities.get('manuscript/volume-001/chapter-0042.md')?.data).toEqual(
      initial.snapshot.entities.get('manuscript/volume-001/chapter-0042.md')?.data,
    );
  });

  test('a passed synthetic review clears the stale and blocked flags', () => {
    const store = storeWithHandEditedManuscript();
    store.upsertArtifact({ ...store.getArtifact('chapter-manuscript', 'chapter-0042')!, reviewBlocked: true, updatedAt: '2026-01-01T00:00:00.000Z' });

    applySyntheticReviewOutcome(store, 'chapter-manuscript', 'chapter-0042', { status: 'passed' });

    const artifact = store.getArtifact('chapter-manuscript', 'chapter-0042');
    expect(artifact?.reviewBlocked).toBe(false);
    expect(artifact?.reviewStale).toBe(false);
    expect(isDownstreamAutoFlowBlocked(store, 'chapter-manuscript', 'chapter-0042')).toBe(false);
  });

  test('an override-eligible failure does not block downstream', () => {
    const store = storeWithHandEditedManuscript();

    applySyntheticReviewOutcome(store, 'chapter-manuscript', 'chapter-0042', { status: 'blocked', reviewerResult: exemptibleReview() });

    expect(isDownstreamAutoFlowBlocked(store, 'chapter-manuscript', 'chapter-0042')).toBe(false);
  });
});

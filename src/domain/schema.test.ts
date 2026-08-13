import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BookSchema,
  ChapterOutlineSchema,
  CommandEnvelopeSchema,
  ReviewerResultSchema,
} from './schema';

test('BookSchema validates a valid book payload', () => {
  const result = BookSchema.safeParse({
    id: 'book-1',
    title: '  My Book  ',
    status: 'planning',
    activeVolumeId: 'volume-1',
    latestCanonicalVersion: 'v1',
    globalPromises: ['promise-1'],
    globalConstraints: ['constraint-1'],
    defaultChapterTypePolicy: {
      maxConsecutiveSamePrimaryType: 2,
    },
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.title, 'My Book');
  }
});

test('BookSchema rejects non-stable ids', () => {
  const result = BookSchema.safeParse({
    id: 'Book_1',
    title: 'My Book',
    status: 'planning',
    activeVolumeId: 'volume-1',
    latestCanonicalVersion: 'v1',
    globalPromises: [],
    globalConstraints: [],
    defaultChapterTypePolicy: {
      maxConsecutiveSamePrimaryType: 1,
    },
  });

  assert.equal(result.success, false);
});

test('ChapterOutlineSchema requires at least one scene', () => {
  const result = ChapterOutlineSchema.safeParse({
    id: 'chapter-1',
    chapterNumber: 1,
    volumeId: 'volume-1',
    chapterType: 'progress',
    chapterTypeTags: ['progress'],
    status: 'draft',
    targetWordCount: 2000,
    sceneSkeleton: [],
    emotionCurveStageIds: ['stage-1', 'stage-2', 'stage-3', 'stage-4'],
  });

  assert.equal(result.success, false);
});

test('ChapterOutlineSchema requires 4-6 emotion stages', () => {
  const result = ChapterOutlineSchema.safeParse({
    id: 'chapter-1',
    chapterNumber: 1,
    volumeId: 'volume-1',
    chapterType: 'progress',
    chapterTypeTags: ['progress'],
    status: 'draft',
    targetWordCount: 2000,
    sceneSkeleton: [
      {
        id: 'scene-1',
        purpose: 'set-up conflict',
        locationId: 'location-1',
        participantCharacterIds: ['character-1'],
      },
    ],
    emotionCurveStageIds: ['stage-1', 'stage-2', 'stage-3'],
  });

  assert.equal(result.success, false);
});

test('CommandEnvelopeSchema rejects invalid approval mode', () => {
  const result = CommandEnvelopeSchema.safeParse({
    workspaceId: 'workspace-1',
    bookId: 'book-1',
    intent: 'propose',
    requestedBy: 'user-1',
    approvalMode: 'auto',
    idempotencyKey: 'key-1',
  });

  assert.equal(result.success, false);
});

test('CommandEnvelopeSchema validates a valid payload', () => {
  const result = CommandEnvelopeSchema.safeParse({
    workspaceId: 'workspace-1',
    bookId: 'book-1',
    intent: 'propose',
    requestedBy: 'user-1',
    approvalMode: 'manual',
    idempotencyKey: 'key-1',
  });

  assert.equal(result.success, true);
});

test('ReviewerResultSchema rejects totalScore outside 0-100', () => {
  const result = ReviewerResultSchema.safeParse({
    approved: true,
    hardFailures: [],
    dimensionScores: {
      antiAiVoice: 90,
      webFictionPacing: 88,
      emotionCurve: 91,
      characterConsistency: 92,
      settingConsistency: 89,
      clueCausality: 90,
      readabilityLayout: 87,
      languageTexture: 88,
    },
    totalScore: 101,
    rewriteDirectives: [],
    overrideEligible: false,
  });

  assert.equal(result.success, false);
});

test('ReviewerResultSchema validates score within 0-100', () => {
  const result = ReviewerResultSchema.safeParse({
    approved: true,
    hardFailures: [],
    dimensionScores: {
      antiAiVoice: 90,
      webFictionPacing: 88,
      emotionCurve: 91,
      characterConsistency: 92,
      settingConsistency: 89,
      clueCausality: 90,
      readabilityLayout: 87,
      languageTexture: 88,
    },
    totalScore: 95,
    rewriteDirectives: [],
    overrideEligible: false,
  });

  assert.equal(result.success, true);
});

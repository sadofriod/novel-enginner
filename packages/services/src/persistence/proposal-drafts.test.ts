import { afterEach, describe, expect, test } from 'bun:test';

import { createChapterOutlineDraft } from '../runtime/canonical-draft';

import { prisma } from './client';
import { findPersistedCanonicalDraft, persistCanonicalDraft } from './proposal-drafts';

const databaseAvailable = process.env['DATABASE_URL'] !== undefined && process.env['NODE_ENV'] !== 'test';
const createdProposalIds: string[] = [];

const proposalId = `proposal-drafts-test-${Date.now().toString(36)}`;

const OUTLINE_MARKDOWN = `---
id: chapter-drafts-test-outline
chapterNumber: 42
volumeId: volume-001
chapterType: reveal
chapterTypeTags: [reveal]
status: draft
targetWordCount: 3000
sceneSkeleton:
  - id: scene-drafts-test
    purpose: Enter the laboratory
    locationId: location-lab
    participantCharacterIds: []
emotionCurveStageIds: [emotion-1, emotion-2, emotion-3, emotion-4]
---

# Outline

The investigation advances.
`;

afterEach(async () => {
  if (!databaseAvailable) {
    return;
  }
  await prisma.proposalDraft.deleteMany({ where: { proposalId: { in: createdProposalIds } } });
});

describe('canonical draft persistence', () => {
  test('round-trips a validated canonical draft', async () => {
    if (!databaseAvailable) {
      return;
    }
    createdProposalIds.push(proposalId);
    const draft = createChapterOutlineDraft({
      proposalId,
      targetId: 'chapter-drafts-test-outline',
      content: OUTLINE_MARKDOWN,
    });

    await persistCanonicalDraft({
      draft,
      proposal: { artifactType: 'chapter-outline', targetId: 'chapter-drafts-test-outline' },
    });

    const restored = await findPersistedCanonicalDraft(proposalId);

    expect(restored?.relativePath).toBe('state/chapters/chapter-drafts-test-outline.md');
    expect(restored?.content).toBe(OUTLINE_MARKDOWN);
  });
});

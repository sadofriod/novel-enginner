import { describe, expect, test } from 'bun:test';

import {
  CanonicalDraftValidationError,
  createChapterOutlineDraft,
  createChapterManuscriptDraft,
  createVolumeOutlineDraft,
  createValidatedCanonicalDraft,
  validateCanonicalDraftForProposal,
    createBootstrapArtifactDraft,
} from './canonical-draft';

const VALID_CHARACTER_MARKDOWN = `---
id: char-lin-mo
name: Lin Mo
status: active
coreMotivation: Survive the gravity well
worldview: engineering-pragmatist
techLevel: tier-3
---

# Summary

A technical survivor.
`;

describe('canonical draft validation', () => {
  test('creates a persistable draft from canonical Markdown that matches its layout', () => {
    const draft = createValidatedCanonicalDraft({
      proposalId: 'proposal-character-001',
      relativePath: 'state/characters/char-lin-mo.md',
      content: VALID_CHARACTER_MARKDOWN,
    });

    expect(draft).toEqual({
      proposalId: 'proposal-character-001',
      relativePath: 'state/characters/char-lin-mo.md',
      content: VALID_CHARACTER_MARKDOWN,
    });
  });

    test('creates a validated project brief draft at its fixed canonical path', () => {
      const draft = createBootstrapArtifactDraft({
        proposalId: 'proposal-brief-001',
        artifactType: 'project-brief',
        content: `---
  id: project-brief-001
  bookId: book-001
  title: Test
  genres: [scifi]
  targetAudience: readers
  marketScope: local
  readerPromise: tension
  corePremise: premise
  openingHook: hook
  contentBoundaries: []
  format: serial
  sourceResearchEvidenceIds: []
  assumptionIds: []
  status: draft
  ---
  `,
      });

      expect(draft.relativePath).toBe('state/book/project-brief.md');
    });

  test('rejects a draft whose path or frontmatter does not satisfy the canonical contract', () => {
    expect(() => createValidatedCanonicalDraft({
      proposalId: 'proposal-character-001',
      relativePath: 'references/character.md',
      content: VALID_CHARACTER_MARKDOWN,
    })).toThrow(CanonicalDraftValidationError);

    expect(() => createValidatedCanonicalDraft({
      proposalId: 'proposal-character-001',
      relativePath: 'state/characters/char-lin-mo.md',
      content: VALID_CHARACTER_MARKDOWN.replace('status: active', 'status: unknown'),
    })).toThrow(CanonicalDraftValidationError);
  });

  test('requires a draft to match its proposal artifact type and target id', () => {
    const draft = createValidatedCanonicalDraft({
      proposalId: 'proposal-character-001',
      relativePath: 'state/characters/char-lin-mo.md',
      content: VALID_CHARACTER_MARKDOWN,
    });

    expect(validateCanonicalDraftForProposal(draft, {
      artifactType: 'character-update',
      targetId: 'char-lin-mo',
    })).toEqual(draft);

    expect(() => validateCanonicalDraftForProposal(draft, {
      artifactType: 'character-update',
      targetId: 'char-other',
    })).toThrow(CanonicalDraftValidationError);

    expect(() => validateCanonicalDraftForProposal({
      ...draft,
      relativePath: 'state/characters/char-other.md',
    }, {
      artifactType: 'character-update',
      targetId: 'char-lin-mo',
    })).toThrow(CanonicalDraftValidationError);
  });
});

describe('chapter outline drafts', () => {
  test('derives the canonical chapter path and validates generated Markdown against its proposal', () => {
    const content = `---
id: chapter-0042-outline
chapterNumber: 42
volumeId: volume-001
chapterType: progress
chapterTypeTags: [progress]
status: draft
targetWordCount: 1800
sceneSkeleton:
  - id: scene-0042-entry
    purpose: Enter the laboratory
    locationId: location-lab
    participantCharacterIds: []
emotionCurveStageIds: [emotion-1, emotion-2, emotion-3, emotion-4]
---

# Outline

The investigation advances.
`;

    expect(createChapterOutlineDraft({
      proposalId: 'proposal-chapter-0042',
      targetId: 'chapter-0042-outline',
      content,
    })).toEqual({
      proposalId: 'proposal-chapter-0042',
      relativePath: 'state/chapters/chapter-0042-outline.md',
      content,
    });
  });
});

describe('volume outline drafts', () => {
  test('derives the canonical volume path and validates generated Markdown against its proposal', () => {
    const content = `---
id: volume-001
title: First Tide
status: planning
sequenceNumber: 1
goal: Establish the first mystery
stage: opening
chapterRoster: [chapter-0001-outline]
targetChapterCount: 24
requiredCluePayoffs: [clue-lantern]
milestones: [milestone-harbor-arrival]
---

# Outline

The first volume establishes the central conflict.
`;

    expect(createVolumeOutlineDraft({
      proposalId: 'proposal-volume-001',
      targetId: 'volume-001',
      content,
    })).toEqual({
      proposalId: 'proposal-volume-001',
      relativePath: 'state/volumes/volume-001.md',
      content,
    });
  });
});

describe('chapter manuscript drafts', () => {
  test('derives the canonical manuscript path from volumeId and proposal target', () => {
    const content = `---
id: chapter-0042
chapterNumber: 42
volumeId: volume-001
basedOnOutlineId: chapter-0042-outline
status: draft
basedOnCanonicalVersion: snap-0001
sceneAnchorIds: [scene-0042-entry]
---

# Scene scene-0042-entry

The laboratory door opens.
`;

    expect(createChapterManuscriptDraft({
      proposalId: 'proposal-chapter-0042-manuscript',
      targetId: 'chapter-0042-manuscript',
      content,
    })).toEqual({
      proposalId: 'proposal-chapter-0042-manuscript',
      relativePath: 'manuscript/volume-001/chapter-0042.md',
      content,
    });
  });
});

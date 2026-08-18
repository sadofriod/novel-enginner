import { describe, expect, test } from 'bun:test';

import type { CanonicalDraft } from '../../runtime/store';

import { buildImportDiagnosis } from './build-import-diagnosis';

const VALID_CHAPTER_OUTLINE = `---
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
    participantCharacterIds: []
emotionCurveStageIds: [emotion-0001-1, emotion-0001-2, emotion-0001-3, emotion-0001-4]
---

# Outline
`;

const BROKEN_REFERENCE_OUTLINE = `---
id: chapter-0002-outline
chapterNumber: 2
volumeId: volume-001
chapterType: progress
chapterTypeTags: [progress]
status: draft
targetWordCount: 1800
sceneSkeleton:
  - id: scene-0002-entry
    purpose: Meet a missing character
    locationId: location-missing
    participantCharacterIds: [char-missing]
emotionCurveStageIds: [emotion-0002-1, emotion-0002-2, emotion-0002-3, emotion-0002-4]
---

# Outline
`;

function draft(overrides: Partial<CanonicalDraft> = {}): CanonicalDraft {
  return {
    proposalId: 'proposal-import-001',
    relativePath: 'state/chapters/chapter-0001-outline.md',
    content: VALID_CHAPTER_OUTLINE,
    ...overrides,
  };
}

describe('buildImportDiagnosis', () => {
  test('reports a clean informational diagnosis when imported drafts reconcile against existing files', () => {
    const result = buildImportDiagnosis({
      drafts: [draft()],
      existingFiles: [
        { path: 'state/volumes/volume-001.md', content: '---\nid: volume-001\ntitle: 第一卷\nstatus: active\nsequenceNumber: 1\ngoal: 完成主线\nstage: planning\nchapterRoster: [chapter-0001-outline]\ntargetChapterCount: 1\nrequiredCluePayoffs: []\nmilestones: []\n---\n\n# Volume\n' },
        { path: 'state/locations/location-harbor.md', content: '---\nid: location-harbor\nname: 海港\ntype: city\nhazards: []\naccessRules: []\nstatus: active\n---\n\n# Location\n' },
      ],
    });

    expect(result.ready).toBe(true);
    expect(result.unresolvedReferences).toEqual([]);
  });

  test('surfaces broken references in imported draft content without writing files', () => {
    const result = buildImportDiagnosis({
      drafts: [draft({ content: BROKEN_REFERENCE_OUTLINE })],
      existingFiles: [],
    });

    expect(result.ready).toBe(false);
    expect(result.unresolvedReferences).toEqual(expect.arrayContaining(['char-missing', 'location-missing']));
  });
});

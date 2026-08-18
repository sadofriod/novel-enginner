import { describe, expect, test } from 'bun:test';

import { buildRetrospectiveProposals } from './retrospective-proposals';

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

const LOCATION = `---
id: location-harbor
name: 海港
type: city
hazards: []
accessRules: []
status: active
---

# Location
`;

describe('buildRetrospectiveProposals', () => {
  test('builds pending-approval imported proposals from existing canonical files', async () => {
    const items = await buildRetrospectiveProposals({
      files: [
        { path: 'state/chapters/chapter-0001-outline.md', content: CHAPTER_OUTLINE },
        { path: 'state/locations/location-harbor.md', content: LOCATION },
      ],
      runId: 'run-retro-001',
      snapshotId: 'snap-0001',
    });

    expect(items).toHaveLength(2);
    const chapter = items.find((item) => item.proposal.targetId === 'chapter-0001-outline');
    expect(chapter?.proposal).toMatchObject({
      artifactType: 'chapter-outline',
      status: 'pending-approval',
      intent: 'propose',
      origin: 'imported',
      basedOnCanonicalVersion: 'snap-0001',
    });
    expect(chapter?.draft.relativePath).toBe('state/chapters/chapter-0001-outline.md');
    expect(items.every((item) => item.proposal.parentRunId === 'run-retro-001')).toBe(true);
  });

  test('skips non-canonical and unresolvable files', async () => {
    const items = await buildRetrospectiveProposals({
      files: [
        { path: 'references/imported/unmapped/scraps.md', content: '# notes\n' },
        { path: 'state/capabilities/registry.md', content: '---\nid: capability-registry\n---\n\n# Registry\n' },
      ],
      runId: 'run-retro-002',
      snapshotId: 'snap-0001',
    });

    expect(items).toEqual([]);
  });
});

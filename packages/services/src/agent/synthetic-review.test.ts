import { describe, expect, test } from 'bun:test';

import { handleHandEditedArtifact } from './synthetic-review';

describe('synthetic review dispatch', () => {
  test('marks approved hand edits stale and forwards review content', async () => {
    const events: Array<{ name: string; data: Record<string, unknown> }> = [];
    const result = await handleHandEditedArtifact(
      {
        workspaceId: 'workspace-test',
        bookId: 'book-test',
        artifactType: 'chapter-manuscript',
        targetId: 'chapter-0001-manuscript',
        filePath: 'manuscript/volume-001/chapter-0001.md',
        wasApprovedBeforeEdit: true,
        editedText: 'Edited scene text.',
        proposalId: 'proposal-chapter-0001',
      },
      async (event) => {
        events.push(event);
      },
    );

    expect(result.stale).toBe(true);
    expect(events).toEqual([
      {
        name: 'novel/review.synthetic-requested',
        data: {
          workspaceId: 'workspace-test',
          bookId: 'book-test',
          artifactType: 'chapter-manuscript',
          targetId: 'chapter-0001-manuscript',
          editedFilePath: 'manuscript/volume-001/chapter-0001.md',
          editedText: 'Edited scene text.',
          proposalId: 'proposal-chapter-0001',
        },
      },
    ]);
  });

  test('does not dispatch for an artifact that was not approved', async () => {
    let dispatchCount = 0;
    const result = await handleHandEditedArtifact(
      {
        workspaceId: 'workspace-test',
        bookId: 'book-test',
        artifactType: 'chapter-outline',
        targetId: 'chapter-0001-outline',
        filePath: 'state/chapters/chapter-0001-outline.md',
        wasApprovedBeforeEdit: false,
      },
      async () => {
        dispatchCount += 1;
      },
    );

    expect(result.stale).toBe(false);
    expect(dispatchCount).toBe(0);
  });
});

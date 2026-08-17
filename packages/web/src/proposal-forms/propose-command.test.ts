import { describe, expect, test } from 'bun:test';

import { buildAuthorProposeInput, resolveWorkspace } from './propose-command';

describe('propose command builder', () => {
  test('resolves workspace defaults when config is absent', () => {
    expect(resolveWorkspace(undefined)).toEqual({ workspaceId: 'workspace-local', bookId: 'book-local' });
  });

  test('resolves workspace from config', () => {
    expect(resolveWorkspace({ workspaceId: 'ws-1', bookId: 'book-1', workspaceRoot: '/x' })).toEqual({
      workspaceId: 'ws-1',
      bookId: 'book-1',
    });
  });

  test('builds a propose envelope with frontmatter and body', () => {
    const input = buildAuthorProposeInput(
      { workspaceId: 'ws-1', bookId: 'book-1', workspaceRoot: '/x' },
      'chapter-outline',
      {
        targetId: 'chapter-0001-outline',
        frontmatter: { chapterNumber: 1 },
        sections: { 'Chapter Outline': '细纲。' },
      },
    );

    expect(input.workspaceId).toBe('ws-1');
    expect(input.artifactType).toBe('chapter-outline');
    expect(input.targetId).toBe('chapter-0001-outline');
    expect(input.intent).toBe('propose');
    expect(input.frontmatter).toEqual({ chapterNumber: 1 });
    expect(input.sections).toEqual({ 'Chapter Outline': '细纲。' });
  });

  test('omits body when absent', () => {
    const input = buildAuthorProposeInput(undefined, 'world-change', { targetId: 'world-change' });

    expect(input.sections).toBeUndefined();
    expect(input.scenes).toBeUndefined();
  });
});

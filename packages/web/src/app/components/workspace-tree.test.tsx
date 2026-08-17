import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import { WorkspaceTreeView } from './workspace-tree';

import type { WorkspaceTree } from '../../api-types';

const TREE: WorkspaceTree = {
  volumes: [
    {
      id: 'volume-001',
      kind: 'volume',
      path: 'state/volumes/volume-001.md',
      label: '第一卷 潮汐',
      sequenceNumber: 1,
      chapters: [
        {
          id: 'chapter-0001-outline',
          kind: 'chapter-outline',
          path: 'state/chapters/chapter-0001-outline.md',
          label: 'The Clock at 03:17',
          chapterNumber: 1,
          volumeId: 'volume-001',
          scenes: [{ id: 'scene-clock', purpose: 'x' }],
          manuscriptId: 'chapter-0001-manuscript',
        },
      ],
    },
  ],
  entityGroups: [{ group: 'characters', entities: [{ id: 'char-mira', kind: 'character', path: 'state/characters/char-mira.md', label: 'Mira Vale' }] }],
  planningAnchors: [],
  bookDocs: [],
  unclassified: [],
};

describe('WorkspaceTreeView', () => {
  test('renders volumes, chapters, scenes and entity groups', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceTreeView tree={TREE} onSelect={() => undefined} />,
    );

    expect(markup).toContain('role="tree"');
    expect(markup).toContain('第一卷 潮汐');
    expect(markup).toContain('The Clock at 03:17');
    expect(markup).toContain('Mira Vale');
  });

  test('renders a selectable tree for the configured workspace', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceTreeView
        tree={TREE}
        selected={{ kind: 'character', id: 'char-mira' }}
        onSelect={() => undefined}
      />,
    );

    expect(markup).toContain('Mira Vale');
    expect(markup).toContain('treeitem');
  });
});

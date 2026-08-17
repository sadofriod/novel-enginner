import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import { EntityDetailView } from './entity-detail';

import type { WorkspaceEntityDetail } from '../../api-types';

const OUTLINE: WorkspaceEntityDetail = {
  kind: 'chapter-outline',
  id: 'chapter-0001-outline',
  path: 'state/chapters/chapter-0001-outline.md',
  frontmatter: { id: 'chapter-0001-outline', chapterNumber: 1, displayTitle: 'The Clock at 03:17', sceneSkeleton: [], emotionCurve: [] },
  sections: {},
  scenes: {},
  raw: '',
};

const CHARACTER: WorkspaceEntityDetail = {
  kind: 'character',
  id: 'char-mira',
  path: 'state/characters/char-mira.md',
  frontmatter: { id: 'char-mira', name: 'Mira Vale', status: 'active' },
  sections: { Character: 'Mira keeps a brass key.' },
  scenes: {},
  raw: '',
};

describe('EntityDetailView', () => {
  test('dispatches chapter outlines to the structured detail', () => {
    const markup = renderToStaticMarkup(<EntityDetailView entity={OUTLINE} />);

    expect(markup).toContain('章节细纲');
    expect(markup).toContain('The Clock at 03:17');
  });

  test('falls back to a generic field grid for other entities', () => {
    const markup = renderToStaticMarkup(<EntityDetailView entity={CHARACTER} />);

    expect(markup).toContain('Mira Vale');
    expect(markup).toContain('status');
    expect(markup).toContain('Mira keeps a brass key.');
  });
});

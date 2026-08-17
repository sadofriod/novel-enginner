import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import { ChapterOutlineDetail } from './chapter-outline-detail';

import type { WorkspaceEntityDetail } from '../../api-types';

const OUTLINE: WorkspaceEntityDetail = {
  kind: 'chapter-outline',
  id: 'chapter-0001-outline',
  path: 'state/chapters/chapter-0001-outline.md',
  frontmatter: {
    id: 'chapter-0001-outline',
    chapterNumber: 1,
    volumeId: 'volume-001',
    chapterType: 'reveal',
    status: 'draft',
    displayTitle: 'The Clock at 03:17',
    targetWordCount: 1800,
    sceneSkeleton: [{ id: 'scene-clock', purpose: 'Mira discovers the stopped clock.', locationId: 'location-harbor' }],
    emotionCurve: [{ id: 'emotion-001', stageType: 'hook', emotionIntensity: 2, targetReaderEffects: ['anticipation'], summary: 'An impossible clock.' }],
    activeClueIds: ['clue-lantern'],
  },
  sections: { 'Chapter Outline': '细纲正文。' },
  scenes: {},
  raw: '---\nid: chapter-0001-outline\n---\n',
};

describe('ChapterOutlineDetail', () => {
  test('renders title, scene skeleton, emotion curve and clue refs', () => {
    const markup = renderToStaticMarkup(<ChapterOutlineDetail entity={OUTLINE} />);

    expect(markup).toContain('The Clock at 03:17');
    expect(markup).toContain('第 1 章');
    expect(markup).toContain('scene-clock');
    expect(markup).toContain('An impossible clock.');
    expect(markup).toContain('clue-lantern');
    expect(markup).toContain('细纲正文。');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, test } from 'bun:test';

import { ChapterContentView } from './chapter-view';
import { controlApi } from '../../control-api';

import type { WorkspaceEntityDetail } from '../../api-types';

function makeStore() {
  return configureStore({
    reducer: { [controlApi.reducerPath]: controlApi.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(controlApi.middleware),
  });
}

const OUTLINE_ENTITY: WorkspaceEntityDetail = {
  kind: 'chapter-outline',
  id: 'chapter-0001-outline',
  path: 'state/chapters/chapter-0001-outline.md',
  frontmatter: { id: 'chapter-0001-outline', displayTitle: '修复师的日常', chapterNumber: 1, status: 'approved', targetWordCount: 5963 },
  sections: { Outline: '大纲正文段落。' },
  scenes: {},
  raw: '---\nid: chapter-0001-outline\n---\n',
};

describe('ChapterContentView', () => {
  test('renders the outline by default with a 大纲/正文 toggle', () => {
    const store = makeStore();
    const markup = renderToStaticMarkup(
      <Provider store={store}>
        <ChapterContentView outlineEntity={OUTLINE_ENTITY} manuscriptId="chapter-0001" />
      </Provider>,
    );

    expect(markup).toContain('大纲');
    expect(markup).toContain('正文');
    expect(markup).toContain('修复师的日常');
  });

  test('renders the outline when no manuscriptId is available', () => {
    const store = makeStore();
    const markup = renderToStaticMarkup(
      <Provider store={store}>
        <ChapterContentView outlineEntity={OUTLINE_ENTITY} />
      </Provider>,
    );

    expect(markup).toContain('修复师的日常');
    expect(markup).toContain('大纲');
  });
});

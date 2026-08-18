import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import { MarkdownView } from './markdown-view';

describe('MarkdownView', () => {
  test('renders headings, emphasis and links as HTML', () => {
    const markup = renderToStaticMarkup(
      <MarkdownView content={'# 标题\n\n凯说 **注意** 这个。\n\n[链接](https://example.com)'} />,
    );

    expect(markup).toContain('<h1>');
    expect(markup).toContain('标题');
    expect(markup).toContain('<strong>');
    expect(markup).toContain('注意');
    expect(markup).toContain('<a href="https://example.com"');
  });

  test('renders GFM tables', () => {
    const markup = renderToStaticMarkup(
      <MarkdownView content={'| a | b |\n| - | - |\n| 1 | 2 |'} />,
    );

    expect(markup).toContain('<table>');
    expect(markup).toContain('<th>');
  });

  test('escapes raw HTML instead of passing it through', () => {
    const markup = renderToStaticMarkup(
      <MarkdownView content={'<script>alert(1)</script>'} />,
    );

    expect(markup).not.toContain('<script>alert(1)</script>');
    expect(markup).toContain('alert(1)');
  });

  test('renders blank-line separated paragraphs', () => {
    const markup = renderToStaticMarkup(
      <MarkdownView content={'第一段。\n\n第二段。'} />,
    );

    expect(markup.match(/<p>/g)?.length).toBe(2);
  });
});

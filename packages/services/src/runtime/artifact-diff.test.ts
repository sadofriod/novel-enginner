import { describe, expect, test } from 'bun:test';

import { buildContentFieldDiff } from './artifact-diff';

describe('buildContentFieldDiff', () => {
  test('reports a changed content diff between canonical and proposed', () => {
    const canonical = '原始正文。';
    const proposed = '优化后的正文。';
    expect(buildContentFieldDiff(canonical, proposed)).toEqual([
      { field: 'content', canonical: '原始正文。', proposed: '优化后的正文。', changed: true },
    ]);
  });

  test('reports unchanged when the content is identical', () => {
    expect(buildContentFieldDiff('相同内容', '相同内容')).toEqual([
      { field: 'content', canonical: '相同内容', proposed: '相同内容', changed: false },
    ]);
  });
});

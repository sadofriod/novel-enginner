import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import type { ArtifactSummary } from '@novel-enginner/services/runtime/store';

import { InteractiveDerivedGraph } from './InteractiveDerivedGraph';

const graph: NonNullable<ArtifactSummary['derivedGraph']> = {
  status: 'ready',
  nodes: [
    { id: 'char-1', label: 'Hero', type: 'Character' },
  ],
  edges: [],
};

describe('InteractiveDerivedGraph', () => {
  test('renders the graph status and node/edge counts', () => {
    const html = renderToStaticMarkup(<InteractiveDerivedGraph graph={graph} />);

    expect(html).toContain('剧情图谱 / 派生状态');
    expect(html).toContain('ready');
    expect(html).toContain('1 个节点 / 0 条边');
  });

  test('renders a stale warning when the graph is stale', () => {
    const html = renderToStaticMarkup(<InteractiveDerivedGraph graph={{ ...graph, status: 'stale' }} />);

    expect(html).toContain('尚未追平最新 canonical 版本');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';
import { DerivedGraphView } from './DerivedGraphView';
import { StaticGraphView } from './StaticGraphView';
import type { ArtifactDerivedGraph } from '@novel-enginner/services/runtime/artifact-detail';

const graph: ArtifactDerivedGraph = {
  status: 'ready',
  latestCanonicalVersion: 'snap-1',
  graphSnapshotVersion: 'graph-1',
  nodes: [
    { id: 'chapter-1', label: '第一章', type: 'Chapter' },
    { id: 'char-1', label: '主角', type: 'Character' },
    { id: 'loc-1', label: '帝都', type: 'Location' },
  ],
  edges: [
    { source: 'chapter-1', target: 'char-1', type: 'introduces' },
    { source: 'char-1', target: 'loc-1', type: 'located-in' },
  ],
};

const staleGraph: ArtifactDerivedGraph = { ...graph, status: 'stale' };

describe('DerivedGraphView', () => {
  test('renders without graph', () => {
    const html = renderToStaticMarkup(<DerivedGraphView graph={undefined} />);
    expect(html).toContain('剧情图谱');
    expect(html).toContain('还没有可展示');
  });

  test('renders graph metadata', () => {
    const html = renderToStaticMarkup(<DerivedGraphView graph={graph} />);
    expect(html).toContain('剧情图谱');
    expect(html).toContain('snap-1');
    expect(html).toContain('graph-1');
    expect(html).toContain('ready');
  });

  test('renders static SVG when nodes present', () => {
    const html = renderToStaticMarkup(<DerivedGraphView graph={graph} />);
    expect(html).toContain('<svg');
    expect(html).toContain('aria-label="剧情图谱"');
  });

  test('shows stale warning when status is stale', () => {
    const html = renderToStaticMarkup(<DerivedGraphView graph={staleGraph} />);
    expect(html).toContain('尚未追平');
  });

  test('no stale warning for ready status', () => {
    const html = renderToStaticMarkup(<DerivedGraphView graph={graph} />);
    expect(html).not.toContain('尚未追平');
  });
});

describe('StaticGraphView', () => {
  test('renders SVG with all node types', () => {
    const richGraph: ArtifactDerivedGraph = {
      status: 'ready',
      latestCanonicalVersion: 'v1',
      graphSnapshotVersion: 'g1',
      nodes: [
        { id: 'c1', label: '章节', type: 'Chapter' },
        { id: 'p1', label: '伏笔', type: 'PlotClue' },
        { id: 'ch1', label: '角色', type: 'Character' },
        { id: 'f1', label: '势力', type: 'Faction' },
        { id: 'l1', label: '地点', type: 'Location' },
        { id: 't1', label: '规则', type: 'TechRule' },
        { id: 's1', label: '场景', type: 'Scene' },
      ],
      edges: [{ source: 'c1', target: 'ch1', type: 'introduces' }],
    };
    const html = renderToStaticMarkup(<StaticGraphView graph={richGraph} />);
    expect(html).toContain('<svg');
    expect(html).toContain('剧情图谱');
    // All node labels should appear
    expect(html).toContain('章节');
    expect(html).toContain('角色');
    expect(html).toContain('场景');
  });

  test('renders edges with type labels', () => {
    const html = renderToStaticMarkup(<StaticGraphView graph={graph} />);
    expect(html).toContain('introduces');
    expect(html).toContain('located-in');
  });

  test('renders custom size', () => {
    const html = renderToStaticMarkup(<StaticGraphView graph={graph} width={800} height={500} />);
    expect(html).toContain('width="800"');
    expect(html).toContain('height="500"');
  });

  test('handles empty nodes gracefully', () => {
    const emptyGraph: ArtifactDerivedGraph = { status: 'ready', nodes: [], edges: [] };
    const html = renderToStaticMarkup(<StaticGraphView graph={emptyGraph} />);
    expect(html).toContain('<svg');
  });

  test('includes arrowhead marker defs', () => {
    const html = renderToStaticMarkup(<StaticGraphView graph={graph} />);
    expect(html).toContain('<defs>');
    expect(html).toContain('marker');
  });

  test('MUI node type colors are applied', () => {
    const html = renderToStaticMarkup(<StaticGraphView graph={graph} />);
    expect(html).toContain('#e3f2fd'); // Chapter fill
    expect(html).toContain('#e8f5e9'); // Character fill
  });
});

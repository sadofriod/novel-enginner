import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';
import { RadarChart } from './RadarChart';

const AXES = [
  { label: '文风', value: 90 },
  { label: '节奏', value: 85 },
  { label: '情绪', value: 80 },
  { label: '角色', value: 92 },
  { label: '设定', value: 88 },
  { label: '伏笔', value: 78 },
  { label: '排版', value: 83 },
  { label: '质感', value: 91 },
];

describe('RadarChart', () => {
  test('renders SVG markup without DOM APIs', () => {
    const html = renderToStaticMarkup(<RadarChart axes={AXES} />);
    expect(html).toContain('<svg');
    expect(html).toContain('维度评分雷达图');
  });

  test('renders passing color when avg >= threshold', () => {
    // avg of 90s is clearly above 75
    const html = renderToStaticMarkup(<RadarChart axes={AXES} threshold={75} />);
    expect(html).toContain('#1976d2'); // PASS_COLOR
  });

  test('renders failing color when avg < threshold', () => {
    const lowAxes = AXES.map((a) => ({ ...a, value: 50 }));
    const html = renderToStaticMarkup(<RadarChart axes={lowAxes} threshold={75} />);
    expect(html).toContain('#d32f2f'); // FAIL_COLOR
  });

  test('returns null for fewer than 3 axes', () => {
    const html = renderToStaticMarkup(<RadarChart axes={[{ label: 'a', value: 80 }, { label: 'b', value: 70 }]} />);
    expect(html).toBe('');
  });

  test('renders custom size', () => {
    const html = renderToStaticMarkup(<RadarChart axes={AXES} size={320} />);
    expect(html).toContain('width="320"');
  });

  test('threshold ring rendered as dashed orange', () => {
    const html = renderToStaticMarkup(<RadarChart axes={AXES} />);
    expect(html).toContain('#fb8c00');
    expect(html).toContain('stroke-dasharray');
  });
});

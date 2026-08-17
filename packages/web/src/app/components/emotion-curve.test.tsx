import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import { EmotionCurve } from './emotion-curve';

describe('EmotionCurve', () => {
  test('renders stage summary and reader effects', () => {
    const markup = renderToStaticMarkup(
      <EmotionCurve
        stages={[
          { id: 'e1', stageType: 'hook', emotionIntensity: 2, targetReaderEffects: ['anticipation'], summary: 'An impossible clock.' },
        ]}
      />,
    );

    expect(markup).toContain('hook');
    expect(markup).toContain('anticipation');
    expect(markup).toContain('An impossible clock.');
    expect(markup).toContain('强度 2/5');
  });

  test('clamps intensity into the 1-5 range', () => {
    const markup = renderToStaticMarkup(
      <EmotionCurve stages={[{ id: 'e1', stageType: 'climax', emotionIntensity: 9 }]} />,
    );

    expect(markup).toContain('强度 5/5');
  });

  test('renders an empty state when there are no stages', () => {
    const markup = renderToStaticMarkup(<EmotionCurve stages={[]} />);

    expect(markup).toContain('情绪曲线');
  });
});

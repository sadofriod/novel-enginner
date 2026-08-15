import { describe, expect, test } from 'bun:test';

import { parseReviewerModelEvidence } from './reviewer-agent';

const EVIDENCE = JSON.stringify({
  hardFailures: [],
  dimensionScores: {
    antiAiVoice: 90, webFictionPacing: 88, emotionCurve: 86, characterConsistency: 91,
    settingConsistency: 89, clueCausality: 87, readabilityLayout: 90, languageTexture: 88,
  },
  rewriteDirectives: [],
});

describe('parseReviewerModelEvidence', () => {
  test('accepts structured model evidence with all scoring dimensions', () => {
    expect(parseReviewerModelEvidence(EVIDENCE).dimensionScores.emotionCurve).toBe(86);
  });

  test('rejects malformed or incomplete model evidence instead of defaulting a passing score', () => {
    expect(() => parseReviewerModelEvidence('not-json')).toThrow('valid JSON');
    expect(() => parseReviewerModelEvidence('{"hardFailures":[]}')).toThrow();
  });
});
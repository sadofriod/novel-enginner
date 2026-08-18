import { describe, expect, test } from 'bun:test';

import type { ModelProvider } from './provider';
import { parseReviewerModelEvidence, requestReviewerModelEvidence } from './reviewer-agent';

function mockProvider(completionText: string): ModelProvider {
  return {
    providerId: 'mock',
    providerVersion: '1',
    resolveModelId: () => 'mock',
    complete: async () => ({ text: completionText, modelId: 'mock', providerVersion: '1' }),
  };
}

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

  test('accepts markdown-fenced JSON as models commonly wrap their response', () => {
    const fenced = `\`\`\`json\n${EVIDENCE}\n\`\`\``;
    expect(parseReviewerModelEvidence(fenced).dimensionScores.emotionCurve).toBe(86);
  });

  test('surfaces the raw model output in the parse error instead of a bare signal', () => {
    expect(() => parseReviewerModelEvidence('not-json')).toThrow(/Raw model output:/);
  });
});

describe('requestReviewerModelEvidence', () => {
  test('parses a markdown-fenced model response through the full request path', async () => {
    const provider = mockProvider(`\`\`\`json\n${EVIDENCE}\n\`\`\``);
    const evidence = await requestReviewerModelEvidence(provider, 'chapter-manuscript', 'prose');
    expect(evidence.dimensionScores.emotionCurve).toBe(86);
  });
});
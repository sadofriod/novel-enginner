import { describe, expect, test } from 'bun:test';

import { type ModelProvider } from '../provider';

import {
  analyzeIntent,
  IntentAnalysisError,
  parseAgentIntent,
  type AgentIntent,
  type IntentAnalysisInput,
} from './intent';

const intentInput: IntentAnalysisInput = {
  role: 'drafter',
  artifactType: 'chapter-manuscript',
  instructions: '把细纲写成正文。',
  canonicalContext: '已审批细纲：场景一，码头对峙。',
};

const provider: ModelProvider = {
  providerId: 'test',
  providerVersion: 'test-v1',
  resolveModelId: (tier) => `test-${tier}`,
  complete: async (request) => ({
    text: request.prompt,
    modelId: 'test-economy',
    providerVersion: 'test-v1',
  }),
};

describe('parseAgentIntent', () => {
  test('parses a valid intent JSON with defaults applied', () => {
    const intent = parseAgentIntent(
      '{"intentType":"generate","tools":["read-canonical"],"rules":["banned-terms"],"needRag":true,"ragQuery":"码头"}',
    );
    expect(intent).toMatchObject({
      intentType: 'generate',
      tools: ['read-canonical'],
      rules: ['banned-terms'],
      needRag: true,
      ragQuery: '码头',
    });
  });

  test('applies defaults for optional fields', () => {
    const intent = parseAgentIntent('{"intentType":"generate"}');
    expect(intent).toMatchObject({ intentType: 'generate', tools: [], rules: [], needRag: false });
    expect(intent.ragQuery).toBeUndefined();
  });

  test('fails fast on invalid JSON', () => {
    expect(() => parseAgentIntent('not-json')).toThrow(IntentAnalysisError);
  });

  test('fails fast on a schema violation', () => {
    expect(() => parseAgentIntent('{"intentType":"unknown-type"}')).toThrow(IntentAnalysisError);
  });
});

describe('analyzeIntent', () => {
  test('returns the parsed intent from the provider', async () => {
    const completingProvider: ModelProvider = {
      ...provider,
      complete: async () => ({
        text: '{"intentType":"optimize","tools":[],"rules":["banned-terms","paragraph-length"],"needRag":false}',
        modelId: 'test-economy',
        providerVersion: 'test-v1',
      }),
    };
    const intent: AgentIntent = await analyzeIntent(completingProvider, intentInput);
    expect(intent.intentType).toBe('optimize');
    expect(intent.rules).toEqual(['banned-terms', 'paragraph-length']);
  });

  test('propagates a parse failure instead of degrading silently', async () => {
    const badProvider: ModelProvider = {
      ...provider,
      complete: async () => ({
        text: 'I think the intent is drafting.',
        modelId: 'test-economy',
        providerVersion: 'test-v1',
      }),
    };
    await expect(analyzeIntent(badProvider, intentInput)).rejects.toThrow(IntentAnalysisError);
  });
});

import { describe, expect, test } from 'bun:test';

import { type ModelProvider } from '../provider';
import { type AgentIntent } from './intent';

import { assembleDynamicPrompt, type AssembleDynamicPromptInput } from './pipeline';

const provider: ModelProvider = {
  providerId: 'test',
  providerVersion: 'test-v1',
  resolveModelId: (tier) => `test-${tier}`,
  complete: async () => ({ text: '{}', modelId: 'test-economy', providerVersion: 'test-v1' }),
};

const intentWithRag: AgentIntent = {
  intentType: 'generate',
  tools: ['rag-search', 'read-canonical'],
  rules: ['banned-terms'],
  needRag: true,
  ragQuery: '码头',
};

const input: AssembleDynamicPromptInput = {
  intent: intentWithRag,
  roleTemplate: '你是 Drafter 系统角色。',
  systemRules: '硬规则：禁词命中即失败。',
  projectPolicy: '文风指导：具象优先。',
  artifactType: 'chapter-manuscript',
  targetId: 'chapter-0042',
  instructions: '把细纲写成正文。',
  canonicalContext: '已审批细纲：码头对峙。',
};

describe('assembleDynamicPrompt', () => {
  test('injects selected tool descriptions and RAG results into the prompt', async () => {
    const result = await assembleDynamicPrompt(input, provider, async () => ['码头摘要：涨潮时港口封闭。']);
    expect(result.toolNames).toEqual(['rag-search', 'read-canonical']);
    expect(result.prompt).toContain('rag-search');
    expect(result.prompt).toContain('read-canonical');
    expect(result.prompt).toContain('码头摘要：涨潮时港口封闭。');
    expect(result.prompt).toContain('你是 Drafter 系统角色。');
  });

  test('skips RAG entirely when the intent does not need it', async () => {
    let retrieverCalled = false;
    const result = await assembleDynamicPrompt(
      { ...input, intent: { ...intentWithRag, needRag: false, ragQuery: undefined } },
      provider,
      async () => {
        retrieverCalled = true;
        return ['不应被检索。'];
      },
    );
    expect(retrieverCalled).toBe(false);
    expect(result.ragContext.results).toEqual([]);
    expect(result.prompt).not.toContain('不应被检索。');
  });

  test('notes a pending fact proposal when retrieval is empty and the verdict is new-fact', async () => {
    const newFactProvider: ModelProvider = {
      ...provider,
      complete: async () => ({
        text: '{"verdict":"new-fact","suggestedFact":{"id":"fact-harbor-lock","label":"港口封锁"}}',
        modelId: 'test-economy',
        providerVersion: 'test-v1',
      }),
    };
    const result = await assembleDynamicPrompt(input, newFactProvider, async () => []);
    expect(result.ragContext.verdict).toBe('new-fact');
    expect(result.ragContext.factProposal?.factId).toBe('fact-harbor-lock');
    expect(result.prompt).toContain('fact-harbor-lock');
    expect(result.prompt).toContain('待确认');
  });
});

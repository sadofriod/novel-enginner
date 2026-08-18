import { describe, expect, test } from 'bun:test';

import { type ModelProvider } from '../provider';

import {
  buildFactProposalSuggestion,
  classifyMissingContext,
  parseRagVerdict,
  resolveRagContext,
  type FactProposalSuggestion,
} from './rag';

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

describe('parseRagVerdict', () => {
  test('parses a valid new-fact verdict with a suggested fact', () => {
    const verdict = parseRagVerdict(
      '{"verdict":"new-fact","suggestedFact":{"id":"fact-tide-lock","label":"潮锁","definition":"涨潮时灯塔锁死港口出入口。"}}',
    );
    expect(verdict.verdict).toBe('new-fact');
    expect(verdict.suggestedFact?.label).toBe('潮锁');
  });

  test('rejects an invalid verdict value', () => {
    expect(() => parseRagVerdict('{"verdict":"maybe"}')).toThrow();
  });
});

describe('classifyMissingContext', () => {
  test('degrades to no-result instead of blocking on a malformed response', async () => {
    const badProvider: ModelProvider = {
      ...provider,
      complete: async () => ({ text: 'I am not sure.', modelId: 'test', providerVersion: 'test' }),
    };
    const verdict = await classifyMissingContext(badProvider, '潮锁是什么？');
    expect(verdict.verdict).toBe('no-result');
  });
});

describe('buildFactProposalSuggestion', () => {
  test('builds a pending fact proposal only for a new-fact verdict', () => {
    const proposal: FactProposalSuggestion | undefined = buildFactProposalSuggestion(
      { verdict: 'new-fact', suggestedFact: { id: 'fact-tide-lock', label: '潮锁', definition: '涨潮时港口锁死。' } },
      '潮锁是什么？',
    );
    expect(proposal).toEqual({
      factId: 'fact-tide-lock',
      label: '潮锁',
      definition: '涨潮时港口锁死。',
      sourceQuery: '潮锁是什么？',
    });
  });

  test('returns undefined for a no-result verdict', () => {
    expect(buildFactProposalSuggestion({ verdict: 'no-result' }, '疑问')).toBeUndefined();
  });
});

describe('resolveRagContext', () => {
  test('returns retrieved results when the retriever has matches', async () => {
    const result = await resolveRagContext(
      provider,
      async () => ['码头摘要：涨潮时港口封闭。'],
      '码头',
    );
    expect(result.results).toEqual(['码头摘要：涨潮时港口封闭。']);
    expect(result.verdict).toBeUndefined();
    expect(result.factProposal).toBeUndefined();
  });

  test('produces a fact proposal when retrieval is empty and the verdict is new-fact', async () => {
    const newFactProvider: ModelProvider = {
      ...provider,
      complete: async () => ({
        text: '{"verdict":"new-fact","suggestedFact":{"id":"fact-harbor-lock","label":"港口封锁"}}',
        modelId: 'test-economy',
        providerVersion: 'test-v1',
      }),
    };
    const result = await resolveRagContext(newFactProvider, async () => [], '港口封锁是何时开始的？');
    expect(result.results).toEqual([]);
    expect(result.verdict).toBe('new-fact');
    expect(result.factProposal?.factId).toBe('fact-harbor-lock');
    expect(result.factProposal?.sourceQuery).toBe('港口封锁是何时开始的？');
  });
});

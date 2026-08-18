import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import { OpenAiModelProvider, type ModelToolDefinition } from './provider';

const ragTool: ModelToolDefinition = {
  name: 'rag-search',
  description: 'Vector search over summary documents.',
  parameters: z.object({ query: z.string() }),
};

function toolCallResponse(toolName: string, args: string): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: toolName, arguments: args },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      model: 'gpt-4.1-mini',
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}

function finalResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: text },
          finish_reason: 'stop',
        },
      ],
      model: 'gpt-4.1-mini',
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}

describe('provider tool calling', () => {
  test('completes a multi-step tool-calling round trip and reports tool calls', async () => {
    const previousFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input, init) => {
      calls.push('request');
      if (calls.length === 1) {
        return toolCallResponse('rag-search', '{"query":"码头"}');
      }
      return finalResponse('最终正文。');
    }) as typeof fetch;

    try {
      const provider = new OpenAiModelProvider({ apiKey: 'test-key' });
      const executed: Array<{ name: string; args: unknown }> = [];
      const result = await provider.completeWithTools?.({
        tier: 'balanced',
        system: 'You are concise.',
        prompt: '查询码头。',
        tools: [ragTool],
        maxSteps: 3,
        executeTool: async (name, args) => {
          executed.push({ name, args });
          return '工具结果：码头摘要。';
        },
      });

      expect(result).toBeDefined();
      expect(result?.text).toBe('最终正文。');
      expect(result?.toolCalls).toBeGreaterThan(0);
      expect(executed).toEqual([{ name: 'rag-search', args: { query: '码头' } }]);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test('completes a single-step call without tools', async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => finalResponse('无工具正文。')) as typeof fetch;
    try {
      const provider = new OpenAiModelProvider({ apiKey: 'test-key' });
      const result = await provider.completeWithTools?.({
        tier: 'balanced',
        prompt: '写一句话。',
        tools: [],
        executeTool: async () => '',
      });
      expect(result?.text).toBe('无工具正文。');
      expect(result?.toolCalls).toBe(0);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

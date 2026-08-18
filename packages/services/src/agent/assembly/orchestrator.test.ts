import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { type ModelProvider } from '../provider';
import { type ToolExecutionDeps } from './tools';

import { runDynamicAgentTask, type DynamicAgentTaskInput } from './orchestrator';

const intentJson =
  '{"intentType":"generate","tools":["rag-search"],"rules":["banned-terms"],"needRag":true,"ragQuery":"码头"}';
const verdictJson =
  '{"verdict":"new-fact","suggestedFact":{"id":"fact-harbor-lock","label":"港口封锁","definition":"涨潮时港口封闭。"}}';

const toolDeps: ToolExecutionDeps = {
  ragSearch: async () => 'rag-result',
  graphQuery: async () => 'graph-result',
  readCanonical: async () => 'canonical-result',
};

async function makeWorkspaceInput(): Promise<{ input: DynamicAgentTaskInput; cleanup: () => Promise<void> }> {
  const root = await mkdtemp('/tmp/novel-orchestrator-');
  await mkdir(join(root, 'agents'), { recursive: true });
  await writeFile(join(root, 'agents/drafter.agent.md'), '---\nname: Drafter\n---\n你是正文生成者 Drafter。\n');
  return {
    input: {
      role: 'drafter',
      artifactType: 'chapter-manuscript',
      targetId: 'chapter-0042',
      canonicalContext: '已审批细纲：码头对峙。',
      instructions: '把细纲写成正文。',
      workspaceRoot: root,
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function smartComplete(prompt: string): string {
  if (prompt.includes('Analyze the intent')) {
    return intentJson;
  }
  if (prompt.includes('A context retrieval returned no results')) {
    return verdictJson;
  }
  return 'TASK_TEXT';
}

const baseProvider: ModelProvider = {
  providerId: 'test',
  providerVersion: 'test-v1',
  resolveModelId: (tier) => `test-${tier}`,
  complete: async (request) => ({
    text: smartComplete(request.prompt),
    modelId: 'test-economy',
    providerVersion: 'test-v1',
  }),
};

describe('runDynamicAgentTask', () => {
  test('runs the intent-driven pipeline with tool calling and RAG results', async () => {
    const { input, cleanup } = await makeWorkspaceInput();
    try {
      const provider: ModelProvider = {
        ...baseProvider,
        completeWithTools: async (request) => ({
          text: request.prompt,
          modelId: 'test-balanced',
          providerVersion: 'test-v1',
          toolCalls: 1,
        }),
      };
      const result = await runDynamicAgentTask(input, provider, {
        ragRetriever: async () => ['码头摘要：涨潮时港口封闭。'],
        toolDeps,
      });
      expect(result.text).toContain('你是正文生成者 Drafter。');
      expect(result.text).toContain('rag-search');
      expect(result.text).toContain('码头摘要：涨潮时港口封闭。');
    } finally {
      await cleanup();
    }
  });

  test('falls back to plain completion when the provider lacks tool calling', async () => {
    const { input, cleanup } = await makeWorkspaceInput();
    try {
      const result = await runDynamicAgentTask(input, baseProvider, {
        ragRetriever: async () => ['码头摘要。'],
        toolDeps,
      });
      expect(result.text).toBe('TASK_TEXT');
    } finally {
      await cleanup();
    }
  });

  test('notes a pending fact proposal when retrieval is empty and the verdict is new-fact', async () => {
    const { input, cleanup } = await makeWorkspaceInput();
    try {
      const provider: ModelProvider = {
        ...baseProvider,
        completeWithTools: async (request) => ({
          text: request.prompt,
          modelId: 'test-balanced',
          providerVersion: 'test-v1',
          toolCalls: 1,
        }),
      };
      const result = await runDynamicAgentTask(input, provider, {
        ragRetriever: async () => [],
        toolDeps,
      });
      expect(result.text).toContain('fact-harbor-lock');
      expect(result.text).toContain('待确认');
    } finally {
      await cleanup();
    }
  });
});

/**
 * Dynamic prompt assembly: composes the final prompt from an analyzed intent,
 * selected process tools, reviewer rules, and RAG context. This replaces the
 * static string-concatenation assembly with an intent-driven one.
 *
 * Flow: intent (LLM) -> select tools + rules -> RAG retrieval (query from intent)
 * -> inject tool descriptions, RAG results, and pending fact proposals into the
 * prompt layers.
 */
import { assemblePromptLayers, type PromptLayerInput } from '../model-tiers';
import type { ModelProvider } from '../provider';

import type { AgentIntent } from './intent';
import { resolveRagContext, type RagContextResult, type RagRetriever } from './rag';
import { resolveToolDescriptions } from './tools';

export interface AssembleDynamicPromptInput {
  readonly intent: AgentIntent;
  readonly roleTemplate: string;
  readonly systemRules: string;
  readonly projectPolicy: string;
  readonly artifactType: string;
  readonly targetId: string;
  readonly instructions: string;
  readonly canonicalContext: string;
}

export interface DynamicPromptResult {
  readonly prompt: string;
  readonly toolNames: readonly string[];
  readonly ragContext: RagContextResult;
}

const EMPTY_RAG_CONTEXT: RagContextResult = {
  results: [],
  verdict: undefined,
  factProposal: undefined,
};

function formatToolBlock(toolNames: readonly string[]): string {
  const tools = resolveToolDescriptions(toolNames);
  if (tools.length === 0) {
    return '可用工具：无';
  }
  return ['可用工具：', ...tools.map((tool) => `- ${tool.name}：${tool.description}`)].join('\n');
}

function formatRagContextBlock(ragContext: RagContextResult): string {
  const blocks: string[] = [];
  if (ragContext.results.length > 0) {
    blocks.push(`RAG 上下文：\n${ragContext.results.map((text) => `- ${text}`).join('\n')}`);
  }
  if (ragContext.factProposal !== undefined) {
    blocks.push(
      [
        `待确认 Fact 提案：${ragContext.factProposal.factId}（${ragContext.factProposal.label}）`,
        `定义：${ragContext.factProposal.definition || '待补充'}`,
        '来源查询：' + ragContext.factProposal.sourceQuery,
        '注意：此为待确认提案，须经提案生命周期与人工审批后方可写入 canonical。',
      ].join('\n'),
    );
  }
  return blocks.join('\n\n');
}

/**
 * Assembles the final prompt from the analyzed intent. When the intent requests
 * RAG, retrieval runs with the intent's own query and its results (or a pending
 * fact proposal) are injected alongside the selected tool descriptions.
 */
export async function assembleDynamicPrompt(
  input: AssembleDynamicPromptInput,
  provider: ModelProvider,
  retriever: RagRetriever,
  limit?: number,
): Promise<DynamicPromptResult> {
  const toolNames = input.intent.tools;
  const ragContext =
    input.intent.needRag && input.intent.ragQuery !== undefined
      ? await resolveRagContext(provider, retriever, input.intent.ragQuery, limit)
      : EMPTY_RAG_CONTEXT;

  const layers: PromptLayerInput[] = [
    { layer: 'system-hard-rules', content: input.systemRules },
    { layer: 'project-policy', content: input.projectPolicy },
    { layer: 'agent-role-template', content: input.roleTemplate },
    { layer: 'artifact-type-template', content: `Work on ${input.artifactType} target ${input.targetId}.` },
    {
      layer: 'task-parameters',
      content: [
        input.instructions,
        `Canonical context:\n${input.canonicalContext}`,
        formatToolBlock(toolNames),
        formatRagContextBlock(ragContext),
      ].join('\n\n'),
    },
  ];

  return {
    prompt: assemblePromptLayers(layers),
    toolNames,
    ragContext,
  };
}

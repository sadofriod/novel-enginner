/**
 * Intent-driven agent task orchestrator: the executable entry point of the
 * refined prompt assembly. Flow: analyze intent (LLM, fail-fast) -> select
 * process tools + prose rules -> RAG retrieval (query from intent) -> run
 * tool calling when the provider supports it and the role tier is eligible,
 * otherwise fall back to plain completion.
 */
import {
  isProseArtifactType,
  loadProsePolicyLayers,
  resolveProjectPolicy,
  resolveSystemRules,
} from '../prose-rules';
import { isToolCallingTier, resolveModelTierForRole, type AgentRole } from '../model-tiers';
import type {
  ModelCompletionResult,
  ModelProvider,
  ModelToolCallResult,
  ModelToolDefinition,
} from '../provider';
import { resolveRoleTemplate } from '../role-template';
import type { AgentTaskResult } from '../agent-task';

import { analyzeIntent } from './intent';
import { assembleDynamicPrompt } from './pipeline';
import type { RagRetriever } from './rag';
import { executeProcessTool, resolveToolDescriptions, type ToolExecutionDeps } from './tools';

export interface DynamicAgentTaskInput {
  readonly role: AgentRole;
  readonly artifactType: string;
  readonly targetId: string;
  readonly canonicalContext: string;
  readonly instructions: string;
  readonly workspaceRoot?: string;
  readonly ragLimit?: number;
}

export interface DynamicAgentTaskDeps {
  readonly ragRetriever: RagRetriever;
  readonly toolDeps: ToolExecutionDeps;
}

function resolveWorkspaceRoot(explicit: string | undefined): string {
  return explicit ?? process.env['NOVEL_WORKSPACE_ROOT'] ?? process.cwd();
}

function resolveCompletion(
  provider: ModelProvider,
  role: AgentRole,
  tools: readonly ModelToolDefinition[],
  prompt: string,
  toolDeps: ToolExecutionDeps,
): Promise<ModelToolCallResult | ModelCompletionResult> {
  if (
    provider.completeWithTools !== undefined &&
    tools.length > 0 &&
    isToolCallingTier(resolveModelTierForRole(role))
  ) {
    return provider.completeWithTools({
      tier: resolveModelTierForRole(role),
      system: `You are a constrained ${role} in a novel writing workflow.`,
      prompt,
      tools,
      executeTool: (name, args) => executeProcessTool(name, args, toolDeps),
    });
  }
  return provider.complete({
    tier: resolveModelTierForRole(role),
    system: `You are a constrained ${role} in a novel writing workflow.`,
    prompt,
  });
}

/** Runs the intent-driven dynamic agent task end to end. */
export async function runDynamicAgentTask(
  input: DynamicAgentTaskInput,
  provider: ModelProvider,
  deps: DynamicAgentTaskDeps,
): Promise<AgentTaskResult> {
  const workspaceRoot = resolveWorkspaceRoot(input.workspaceRoot);
  const roleTemplate = await resolveRoleTemplate(workspaceRoot, input.role);
  const proseLayers = isProseArtifactType(input.artifactType)
    ? await loadProsePolicyLayers(workspaceRoot)
    : undefined;
  const systemRules = resolveSystemRules(undefined, proseLayers);
  const projectPolicy = resolveProjectPolicy(undefined, proseLayers);
  const intent = await analyzeIntent(provider, {
    role: input.role,
    artifactType: input.artifactType,
    instructions: input.instructions,
    canonicalContext: input.canonicalContext,
  });
  const assembled = await assembleDynamicPrompt(
    {
      intent,
      roleTemplate,
      systemRules,
      projectPolicy,
      artifactType: input.artifactType,
      targetId: input.targetId,
      instructions: input.instructions,
      canonicalContext: input.canonicalContext,
    },
    provider,
    deps.ragRetriever,
    input.ragLimit,
  );
  const tools: readonly ModelToolDefinition[] = resolveToolDescriptions(intent.tools).map((toolDef) => ({
    name: toolDef.name,
    description: toolDef.description,
    parameters: toolDef.parameterSchema,
  }));
  const completion = await resolveCompletion(provider, input.role, tools, assembled.prompt, deps.toolDeps);

  return {
    role: input.role,
    artifactType: input.artifactType,
    targetId: input.targetId,
    text: completion.text,
    modelId: completion.modelId,
    providerVersion: completion.providerVersion,
  };
}

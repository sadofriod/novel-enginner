import type { ModelProvider, ModelCompletionResult } from './provider';
import { assemblePromptLayers, resolveModelTierForRole, type AgentRole, type PromptLayerInput } from './model-tiers';

export type AgentTaskInput = {
  readonly role: AgentRole;
  readonly artifactType: string;
  readonly targetId: string;
  readonly canonicalContext: string;
  readonly instructions: string;
  readonly capabilityIds?: readonly string[];
  readonly systemRules?: string;
  readonly projectPolicy?: string;
};

export type AgentTaskResult = {
  readonly role: AgentRole;
  readonly artifactType: string;
  readonly targetId: string;
  readonly text: string;
  readonly modelId: string;
  readonly providerVersion: string;
};

function buildPrompt(input: AgentTaskInput): string {
  const layers: PromptLayerInput[] = [
    { layer: 'system-hard-rules', content: input.systemRules ?? 'Return only work relevant to the requested artifact.' },
    { layer: 'project-policy', content: input.projectPolicy ?? 'Canonical Markdown is the source of truth; do not invent missing facts.' },
    { layer: 'agent-role-template', content: `You are the ${input.role} agent.` },
    { layer: 'artifact-type-template', content: `Work on ${input.artifactType} target ${input.targetId}.` },
    {
      layer: 'task-parameters',
      content: [
        input.instructions,
        `Canonical context:\n${input.canonicalContext}`,
        `Available capabilities: ${(input.capabilityIds ?? []).join(', ') || 'none'}`,
      ].join('\n\n'),
    },
  ];
  return assemblePromptLayers(layers);
}

export async function executeAgentTask(
  input: AgentTaskInput,
  provider: ModelProvider,
): Promise<AgentTaskResult> {
  const completion: ModelCompletionResult = await provider.complete({
    tier: resolveModelTierForRole(input.role),
    system: `You are a constrained ${input.role} in a novel writing workflow.`,
    prompt: buildPrompt(input),
  });

  return {
    role: input.role,
    artifactType: input.artifactType,
    targetId: input.targetId,
    text: completion.text,
    modelId: completion.modelId,
    providerVersion: completion.providerVersion,
  };
}

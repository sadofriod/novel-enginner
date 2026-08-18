import type { ModelProvider, ModelCompletionResult } from './provider';
import { assemblePromptLayers, resolveModelTierForRole, type AgentRole, type PromptLayerInput } from './model-tiers';
import {
  isProseArtifactType,
  loadProsePolicyLayers,
  resolveProjectPolicy,
  resolveSystemRules,
} from './prose-rules';
import { resolveRoleTemplate } from './role-template';

export type AgentTaskInput = {
  readonly role: AgentRole;
  readonly artifactType: string;
  readonly targetId: string;
  readonly canonicalContext: string;
  readonly instructions: string;
  readonly capabilityIds?: readonly string[];
  readonly systemRules?: string;
  readonly projectPolicy?: string;
  /**
   * Workspace root used to resolve `agents/<role>.agent.md`. Defaults to
   * `NOVEL_WORKSPACE_ROOT`, then `process.cwd()`, matching `loadReviewerRules`.
   */
  readonly workspaceRoot?: string;
};

export type AgentTaskResult = {
  readonly role: AgentRole;
  readonly artifactType: string;
  readonly targetId: string;
  readonly text: string;
  readonly modelId: string;
  readonly providerVersion: string;
};

function buildPrompt(
  input: AgentTaskInput,
  roleTemplate: string,
  systemRules: string,
  projectPolicy: string,
): string {
  const layers: PromptLayerInput[] = [
    { layer: 'system-hard-rules', content: systemRules },
    { layer: 'project-policy', content: projectPolicy },
    { layer: 'agent-role-template', content: roleTemplate },
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
  const workspaceRoot = input.workspaceRoot ?? process.env['NOVEL_WORKSPACE_ROOT'] ?? process.cwd();
  const proseLayers = isProseArtifactType(input.artifactType)
    ? await loadProsePolicyLayers(workspaceRoot)
    : undefined;
  const roleTemplate = await resolveRoleTemplate(workspaceRoot, input.role);
  const systemRules = resolveSystemRules(input.systemRules, proseLayers);
  const projectPolicy = resolveProjectPolicy(input.projectPolicy, proseLayers);
  const completion: ModelCompletionResult = await provider.complete({
    tier: resolveModelTierForRole(input.role),
    system: `You are a constrained ${input.role} in a novel writing workflow.`,
    prompt: buildPrompt(input, roleTemplate, systemRules, projectPolicy),
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

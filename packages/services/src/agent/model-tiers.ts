/**
 * Agent role -> model tier / MCP scope mapping, per
 * docs/architecture/modules/04-workflows-and-agents.md §4.3 and
 * docs/architecture/modules/08-graph-search-and-capabilities.md §8.6.
 */
import type { ModelTier } from './provider';

export const AGENT_ROLE_VALUES = [
  'world-builder',
  'plot-planner',
  'actor',
  'update-actor',
  'drafter',
  'reviewer',
] as const;

export type AgentRole = (typeof AGENT_ROLE_VALUES)[number];

/**
 * Static V1 model tier assignment per role. World/plot-level reasoning gets the
 * flagship tier; high-volume drafting and narrow bookkeeping roles use cheaper tiers.
 */
const MODEL_TIER_BY_ROLE: Record<AgentRole, ModelTier> = {
  'world-builder': 'flagship',
  'plot-planner': 'flagship',
  actor: 'balanced',
  'update-actor': 'economy',
  drafter: 'balanced',
  reviewer: 'flagship',
};

export function resolveModelTierForRole(role: AgentRole): ModelTier {
  return MODEL_TIER_BY_ROLE[role];
}

/**
 * Tiers that support tool calling, per the refined assembly contract: only
 * flagship and balanced expose tools; economy degrades to plain text.
 */
const TOOL_CALLING_TIERS: ReadonlySet<ModelTier> = new Set(['flagship', 'balanced']);

export function isToolCallingTier(tier: ModelTier): boolean {
  return TOOL_CALLING_TIERS.has(tier);
}

/**
 * Default external MCP server ids allowed per role. Per §8.6:
 * - WorldBuilder / PlotPlanner / Reviewer default to the limited external scope
 *   (`cloakbrowser` in V1).
 * - Drafter has no broad MCP access by default.
 * - Actor is read-only over the character ledger/context and gets no external MCP.
 */
const DEFAULT_MCP_SCOPE_BY_ROLE: Record<AgentRole, readonly string[]> = {
  'world-builder': ['cloakbrowser'],
  'plot-planner': ['cloakbrowser'],
  actor: [],
  'update-actor': [],
  drafter: [],
  reviewer: ['cloakbrowser'],
};

export function resolveDefaultMcpScopeForRole(role: AgentRole): readonly string[] {
  return DEFAULT_MCP_SCOPE_BY_ROLE[role];
}

/**
 * Prompt layering order, per §8.6:
 * 1. system hard rules, 2. project-level policy, 3. agent role template,
 * 4. artifact-type template, 5. task parameters.
 */
export const PROMPT_LAYER_ORDER = [
  'system-hard-rules',
  'project-policy',
  'agent-role-template',
  'artifact-type-template',
  'task-parameters',
] as const;

export type PromptLayer = (typeof PROMPT_LAYER_ORDER)[number];

export interface PromptLayerInput {
  readonly layer: PromptLayer;
  readonly content: string;
}

/**
 * Assembles prompt layers in the canonical §8.6 order, ignoring any layers not present
 * in the input (a role/artifact type may not need every layer). Layers are joined with a
 * blank line so each remains visually distinguishable in the final prompt.
 */
export function assemblePromptLayers(layers: readonly PromptLayerInput[]): string {
  const byLayer = new Map(layers.map((entry) => [entry.layer, entry.content]));
  return PROMPT_LAYER_ORDER.map((layer) => byLayer.get(layer))
    .filter((content): content is string => content !== undefined && content.trim().length > 0)
    .join('\n\n');
}

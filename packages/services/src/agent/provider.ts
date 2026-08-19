/**
 * Provider abstraction + default OpenAI implementation, per
 * docs/architecture/modules/09-v1-clarifications.md §9.5 ("Provider 抽象 + OpenAI 默认实现")
 * and docs/architecture/modules/10-v1-execution-plan.md Phase 7.
 *
 * This intentionally stays a thin seam: the runtime/workflow layers depend on
 * `ModelProvider`, never on a concrete SDK, so a different provider can be swapped in
 * without touching agent assembly or reviewer code.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';

import { buildCompositeProvider, type TierSubProvider } from './composite-provider';
import {
  DEFAULT_OPENAI_MODEL_BY_TIER,
  MODEL_TIER_VALUES,
  loadModelConfig,
  type ModelTier,
} from './model-config';
import { normalizeModelConfig, resolveProviderEntry, type NormalizedModelConfig } from './model-resolver';

export { MODEL_TIER_VALUES, DEFAULT_OPENAI_MODEL_BY_TIER };
export type { ModelTier } from './model-config';

export interface ModelProviderConfig {
  readonly apiKey?: string | undefined;
  readonly baseUrl?: string | undefined;
  /** Per-tier model identifiers, overriding the defaults. */
  readonly modelByTier?: Partial<Record<ModelTier, string>> | undefined;
  /** Request timeout in ms; defaults to the AI SDK request timeout when unset. */
  readonly timeoutMs?: number | undefined;
}

export interface ModelCompletionRequest {
  readonly tier: ModelTier;
  readonly system?: string;
  readonly prompt: string;
}

export interface ModelCompletionResult {
  readonly text: string;
  readonly modelId: string;
  readonly providerVersion: string;
}

/** A tool schema the model can call, with a zod-validated parameters contract. */
export interface ModelToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: z.ZodTypeAny;
}

export interface ModelToolCallRequest {
  readonly tier: ModelTier;
  readonly system?: string;
  readonly prompt: string;
  readonly tools: readonly ModelToolDefinition[];
  /** Max tool-calling steps (the model may call tools repeatedly). Defaults to 3. */
  readonly maxSteps?: number;
  /** Executes a requested tool and returns its text result. */
  readonly executeTool: (name: string, args: unknown) => Promise<string>;
}

export interface ModelToolCallResult {
  readonly text: string;
  readonly modelId: string;
  readonly providerVersion: string;
  /** Number of tool calls executed during the round trip. */
  readonly toolCalls: number;
}

/**
 * Minimal seam every model provider implementation must satisfy. Kept intentionally
 * small so mocking in tests and swapping providers stays cheap.
 *
 * `completeWithTools` is optional: providers that do not support tool calling simply
 * omit it, and the assembly layer degrades to `complete` (per the flagship+balanced
 * tool-calling scope).
 */
export interface ModelProvider {
  readonly providerId: string;
  readonly providerVersion: string;
  resolveModelId(tier: ModelTier): string;
  complete(request: ModelCompletionRequest): Promise<ModelCompletionResult>;
  completeWithTools?(request: ModelToolCallRequest): Promise<ModelToolCallResult>;
}

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderConfigError';
  }
}

/** Default V1 provider backed by the AI SDK's OpenAI adapter. */
export class OpenAiModelProvider implements ModelProvider {
  readonly providerId = 'openai';
  readonly providerVersion = '2024-v1';

  private readonly apiKey: string | undefined;
  private readonly baseUrl: string | undefined;
  private readonly timeoutMs: number | undefined;
  private readonly modelByTier: Record<ModelTier, string>;

  constructor(config: ModelProviderConfig = {}) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs;
    this.modelByTier = { ...DEFAULT_OPENAI_MODEL_BY_TIER, ...(config.modelByTier ?? {}) };
  }

  resolveModelId(tier: ModelTier): string {
    return this.modelByTier[tier];
  }

  private requireApiKey(): string {
    if (this.apiKey === undefined) {
      throw new ProviderConfigError(
        'OpenAI provider requires an apiKey; set OPENAI_API_KEY or pass one explicitly.',
      );
    }
    return this.apiKey;
  }

  private buildOpenAI(): ReturnType<typeof createOpenAI> {
    return createOpenAI({
      apiKey: this.requireApiKey(),
      ...(this.baseUrl === undefined ? {} : { baseURL: this.baseUrl }),
    });
  }

  async complete(request: ModelCompletionRequest): Promise<ModelCompletionResult> {
    const openai = this.buildOpenAI();
    const result = await generateText({
      model: openai(this.resolveModelId(request.tier)),
      ...(request.system === undefined ? {} : { system: request.system }),
      prompt: request.prompt,
      maxRetries: 0,
      ...(this.timeoutMs === undefined ? {} : { timeout: this.timeoutMs }),
    });

    return {
      text: result.text,
      modelId: this.resolveModelId(request.tier),
      providerVersion: this.providerVersion,
    };
  }

  async completeWithTools(request: ModelToolCallRequest): Promise<ModelToolCallResult> {
    const openai = this.buildOpenAI();
    let toolCallCount = 0;
    const tools = Object.fromEntries(
      request.tools.map((toolDef) => [
        toolDef.name,
        tool({
          description: toolDef.description,
          parameters: toolDef.parameters,
          execute: async (args) => {
            toolCallCount += 1;
            return request.executeTool(toolDef.name, args);
          },
        }),
      ]),
    );
    const hasTools = Object.keys(tools).length > 0;
    const result = await generateText({
      model: openai(this.resolveModelId(request.tier)),
      ...(request.system === undefined ? {} : { system: request.system }),
      prompt: request.prompt,
      ...(hasTools ? { tools, maxSteps: request.maxSteps ?? 3 } : {}),
      maxRetries: 0,
      ...(this.timeoutMs === undefined ? {} : { timeout: this.timeoutMs }),
    });

    return {
      text: result.text,
      modelId: this.resolveModelId(request.tier),
      providerVersion: this.providerVersion,
      toolCalls: toolCallCount,
    };
  }

  getBaseUrl(): string | undefined {
    return this.baseUrl;
  }
}

/**
 * Builds one `OpenAiModelProvider` per tier from the resolved provider entry
 * (multi-provider support), keeping a single `ModelProvider` seam.
 */
function buildTierSubProvider(
  normalized: NormalizedModelConfig,
  tier: ModelTier,
): TierSubProvider {
  const entry = resolveProviderEntry(normalized, tier);
  const provider = new OpenAiModelProvider({
    apiKey: entry.apiKey,
    ...(entry.baseUrl === undefined ? {} : { baseUrl: entry.baseUrl }),
    ...(entry.timeoutMs === undefined ? {} : { timeoutMs: entry.timeoutMs }),
    modelByTier: { [tier]: entry.model },
  });
  return { provider, model: entry.model };
}

function buildTierSubProviders(normalized: NormalizedModelConfig): Record<ModelTier, TierSubProvider> {
  const byTier = {} as Record<ModelTier, TierSubProvider>;
  for (const tier of MODEL_TIER_VALUES) {
    byTier[tier] = buildTierSubProvider(normalized, tier);
  }
  return byTier;
}

/**
 * Builds the default multi-provider from a config file (model.config.json) when present,
 * falling back to environment configuration for the implicit `default` provider. Each
 * tier may resolve to a different provider entry (multi-provider support).
 */
export function createDefaultModelProvider(
  env: Readonly<Record<string, string | undefined>> = process.env,
  workspaceRoot?: string,
): ModelProvider {
  const config = loadModelConfig(workspaceRoot);
  const normalized = normalizeModelConfig(config, env);
  return buildCompositeProvider(buildTierSubProviders(normalized));
}

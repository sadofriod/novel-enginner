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
import { generateText } from 'ai';

import { loadModelConfig, type ModelConfig } from './model-config';

export const MODEL_TIER_VALUES = ['flagship', 'balanced', 'economy'] as const;

export type ModelTier = (typeof MODEL_TIER_VALUES)[number];

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

/**
 * Minimal seam every model provider implementation must satisfy. Kept intentionally
 * small (single `complete` method) so mocking in tests and swapping providers stays cheap.
 */
export interface ModelProvider {
  readonly providerId: string;
  readonly providerVersion: string;
  resolveModelId(tier: ModelTier): string;
  complete(request: ModelCompletionRequest): Promise<ModelCompletionResult>;
}

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderConfigError';
  }
}

const DEFAULT_OPENAI_MODEL_BY_TIER: Record<ModelTier, string> = {
  flagship: 'gpt-4.1',
  balanced: 'gpt-4.1-mini',
  economy: 'gpt-4.1-nano',
};

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

  async complete(request: ModelCompletionRequest): Promise<ModelCompletionResult> {
    if (this.apiKey === undefined) {
      throw new ProviderConfigError(
        'OpenAI provider requires an apiKey; set OPENAI_API_KEY or pass one explicitly.',
      );
    }

    const openai = createOpenAI({
      apiKey: this.apiKey,
      ...(this.baseUrl === undefined ? {} : { baseURL: this.baseUrl }),
    });
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

  getBaseUrl(): string | undefined {
    return this.baseUrl;
  }
}

const MODEL_ENV_KEY_BY_TIER: Record<ModelTier, string> = {
  flagship: 'OPENAI_MODEL_FLAGSHIP',
  balanced: 'OPENAI_MODEL_BALANCED',
  economy: 'OPENAI_MODEL_ECONOMY',
};

function valueFrom(configValue: string | undefined, envValue: string | undefined): string | undefined {
  return configValue ?? envValue;
}

/** Builds an optional config fragment, `undefined` when the value is unset (spread as a no-op). */
function fragment<T>(value: T | undefined, build: (value: T) => object): object | undefined {
  return value === undefined ? undefined : build(value);
}

function trimToValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function resolveTierModel(
  config: ModelConfig | undefined,
  env: Readonly<Record<string, string | undefined>>,
  tier: ModelTier,
): string | undefined {
  const fromConfig = config?.models?.[tier];
  if (fromConfig !== undefined) {
    return fromConfig;
  }
  return trimToValue(env[MODEL_ENV_KEY_BY_TIER[tier]]);
}

/** Resolves per-tier model ids from config file first, then environment. */
function resolveModelByTier(
  config: ModelConfig | undefined,
  env: Readonly<Record<string, string | undefined>>,
): Partial<Record<ModelTier, string>> {
  const modelByTier: Partial<Record<ModelTier, string>> = {};
  for (const tier of MODEL_TIER_VALUES) {
    const model = resolveTierModel(config, env, tier);
    if (model !== undefined) {
      modelByTier[tier] = model;
    }
  }
  return modelByTier;
}

/** Returns the model map only when at least one tier was configured, so the provider keeps its defaults. */
function nonEmptyModels(modelByTier: Partial<Record<ModelTier, string>>): Partial<Record<ModelTier, string>> | undefined {
  return Object.keys(modelByTier).length === 0 ? undefined : modelByTier;
}

/**
 * Builds the default V1 provider from a config file (model.config.json) when present,
 * falling back to environment configuration. The config file supplies the provider's
 * `apiKey`, `baseUrl`, and per-tier `models` (模型名称 / key / baseURL), so local and
 * remote model wiring no longer depends on hardcoded OpenAI model ids.
 */
export function createDefaultModelProvider(
  env: Readonly<Record<string, string | undefined>> = process.env,
  workspaceRoot?: string,
): ModelProvider {
  const config = loadModelConfig(workspaceRoot);
  const modelByTier = nonEmptyModels(resolveModelByTier(config, env));
  return new OpenAiModelProvider({
    apiKey: valueFrom(config?.apiKey, env['OPENAI_API_KEY']),
    baseUrl: valueFrom(config?.baseUrl, env['OPENAI_BASE_URL']),
    ...fragment(config?.timeoutMs, (timeoutMs) => ({ timeoutMs })),
    ...fragment(modelByTier, (models) => ({ modelByTier: models })),
  });
}

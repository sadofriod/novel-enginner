/**
 * Provider abstraction + default OpenAI implementation, per
 * docs/architecture/modules/09-v1-clarifications.md §9.5 ("Provider 抽象 + OpenAI 默认实现")
 * and docs/architecture/modules/10-v1-execution-plan.md Phase 7.
 *
 * This intentionally stays a thin seam: the runtime/workflow layers depend on
 * `ModelProvider`, never on a concrete SDK, so a different provider can be swapped in
 * without touching agent assembly or reviewer code.
 */

export const MODEL_TIER_VALUES = ['flagship', 'balanced', 'economy'] as const;

export type ModelTier = (typeof MODEL_TIER_VALUES)[number];

export interface ModelProviderConfig {
  readonly apiKey?: string | undefined;
  readonly baseUrl?: string | undefined;
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

/**
 * Default V1 provider. Resolution of the actual completion call is deferred to the `ai`
 * SDK's OpenAI integration at the call site that owns network access; this class is
 * responsible for the provider-facing contract (model id resolution, versioning) so
 * agent assembly and reviewer code do not need to know SDK details.
 */
export class OpenAiModelProvider implements ModelProvider {
  readonly providerId = 'openai';
  readonly providerVersion = '2024-v1';

  private readonly apiKey: string | undefined;
  private readonly baseUrl: string | undefined;
  private readonly modelByTier: Record<ModelTier, string>;

  constructor(config: ModelProviderConfig = {}) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.modelByTier = { ...DEFAULT_OPENAI_MODEL_BY_TIER };
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

    // The actual network call is intentionally not performed here; callers that need a
    // live completion should construct their own `@ai-sdk/openai` model using
    // `resolveModelId` + the configured baseUrl/apiKey and invoke it directly. This keeps
    // `OpenAiModelProvider` synchronously testable without network access.
    return {
      text: '',
      modelId: this.resolveModelId(request.tier),
      providerVersion: this.providerVersion,
    };
  }

  getBaseUrl(): string | undefined {
    return this.baseUrl;
  }
}

/**
 * Builds the default V1 provider from environment configuration. Centralized here so
 * runtime wiring has one place to change if the default provider ever changes.
 */
export function createDefaultModelProvider(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ModelProvider {
  return new OpenAiModelProvider({
    apiKey: env['OPENAI_API_KEY'],
    baseUrl: env['OPENAI_BASE_URL'],
  });
}

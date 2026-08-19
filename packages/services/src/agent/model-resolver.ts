import { z } from 'zod';

import {
  DEFAULT_OPENAI_MODEL_BY_TIER,
  MODEL_TIER_VALUES,
  type ModelConfig,
  type ModelTier,
  type ProviderEntry,
} from './model-config';

/** A config error that should fail fast with a clear message. */
export class ModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelConfigError';
  }
}

/**
 * Per-tier resolved model refs; a mapped type so indexed access is not `| undefined`.
 */
export type TierModelMap = {
  readonly [K in ModelTier]: { readonly provider: string; readonly model: string };
};

/**
 * Normalized model configuration: a `providers` registry plus a concrete per-tier
 * reference. Environment values are only ever applied to the implicit `default`
 * provider, never to named registry providers.
 */
export interface NormalizedModelConfig {
  readonly providers: Readonly<Record<string, ProviderEntry>>;
  readonly models: TierModelMap;
  /** Default request timeout applied when a provider entry does not override it. */
  readonly defaultTimeoutMs?: number;
}

/**
 * A tier fully resolved to its concrete provider entry and model id. `baseUrl` and
 * `timeoutMs` are required-but-may-be-undefined so callers can assign directly.
 */
export interface ResolvedProviderEntry {
  readonly providerName: string;
  readonly kind: string;
  readonly baseUrl: string | undefined;
  readonly apiKey: string;
  readonly timeoutMs: number | undefined;
  readonly model: string;
}

const MODEL_ENV_KEY_BY_TIER: Record<ModelTier, string> = {
  flagship: 'OPENAI_MODEL_FLAGSHIP',
  balanced: 'OPENAI_MODEL_BALANCED',
  economy: 'OPENAI_MODEL_ECONOMY',
};

export const ModelConfigSchema = z
  .object({
    providers: z
      .record(
        z.string(),
        z
          .object({
            kind: z.string().optional(),
            baseUrl: z.string().optional(),
            apiKey: z.string().optional(),
            timeoutMs: z.number().int().positive().optional(),
          })
          .readonly(),
      )
      .optional(),
    models: z
      .record(
        z.enum(MODEL_TIER_VALUES),
        z.union([z.string(), z.object({ provider: z.string(), model: z.string() }).readonly()]),
      )
      .optional(),
    provider: z.string().optional(),
    baseUrl: z.string().optional(),
    apiKey: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
  })
  .readonly();

/** Picks the config value first, falling back to the environment value. */
function pickConfigOrEnv(value: string | undefined, envValue: string | undefined): string | undefined {
  if (value === undefined) {
    return envValue;
  }
  return value;
}

function envModelForTier(
  env: Readonly<Record<string, string | undefined>>,
  tier: ModelTier,
): string | undefined {
  const value = env[MODEL_ENV_KEY_BY_TIER[tier]]?.trim();
  if (value === undefined || value === '') {
    return undefined;
  }
  return value;
}

/** Mutable local shape for assembling a `ProviderEntry` field by field. */
interface MutableProviderEntry {
  kind?: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/** Builds the implicit `default` provider entry from legacy flat fields + env overrides. */
function defaultProviderEntry(
  config: ModelConfig,
  env: Readonly<Record<string, string | undefined>>,
): ProviderEntry {
  const entry: MutableProviderEntry = { kind: 'openai' };
  if (config.provider !== undefined) {
    entry.kind = config.provider;
  }
  const apiKey = pickConfigOrEnv(config.apiKey, env['OPENAI_API_KEY']);
  if (apiKey !== undefined) {
    entry.apiKey = apiKey;
  }
  const baseUrl = pickConfigOrEnv(config.baseUrl, env['OPENAI_BASE_URL']);
  if (baseUrl !== undefined) {
    entry.baseUrl = baseUrl;
  }
  if (config.timeoutMs !== undefined) {
    entry.timeoutMs = config.timeoutMs;
  }
  return entry;
}

function resolveTierModelRef(
  config: ModelConfig,
  env: Readonly<Record<string, string | undefined>>,
  tier: ModelTier,
): { readonly provider: string; readonly model: string } {
  const configured = config.models?.[tier];
  if (typeof configured === 'string') {
    return { provider: 'default', model: configured };
  }
  if (configured !== undefined) {
    return { provider: configured.provider, model: configured.model };
  }
  // Unconfigured tiers fall back to the default provider, then env, then built-in defaults.
  const model = envModelForTier(env, tier) ?? DEFAULT_OPENAI_MODEL_BY_TIER[tier];
  return { provider: 'default', model };
}

function validateConfigShape(config: ModelConfig | undefined): void {
  if (config === undefined) {
    return;
  }
  const parsed = ModelConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new ModelConfigError(`invalid model config: ${parsed.error.message}`);
  }
}

function buildTierModelMap(
  config: ModelConfig,
  env: Readonly<Record<string, string | undefined>>,
): TierModelMap {
  return Object.fromEntries(
    MODEL_TIER_VALUES.map((tier) => [tier, resolveTierModelRef(config, env, tier)]),
  ) as TierModelMap;
}

function buildProviderRegistry(
  config: ModelConfig,
  env: Readonly<Record<string, string | undefined>>,
): Record<string, ProviderEntry> {
  const providers = { ...(config.providers ?? {}) };
  const defaultEntry = defaultProviderEntry(config, env);
  if (Object.keys(defaultEntry).length > 1) {
    providers['default'] = defaultEntry;
  }
  return providers;
}

/**
 * Normalizes a raw config (either the legacy flat shape or the multi-provider registry)
 * into a `providers` registry plus concrete per-tier references. The implicit `default`
 * provider absorbs legacy flat fields and environment overrides.
 *
 * Structurally invalid configs fail fast with a `ModelConfigError`.
 */
export function normalizeModelConfig(
  config: ModelConfig | undefined,
  env: Readonly<Record<string, string | undefined>> = {},
): NormalizedModelConfig {
  validateConfigShape(config);
  const safeConfig = config ?? {};
  return {
    providers: buildProviderRegistry(safeConfig, env),
    models: buildTierModelMap(safeConfig, env),
    ...(safeConfig.timeoutMs === undefined ? {} : { defaultTimeoutMs: safeConfig.timeoutMs }),
  };
}

function entryTimeoutMs(entry: ProviderEntry, fallback: number | undefined): number | undefined {
  if (entry.timeoutMs !== undefined) {
    return entry.timeoutMs;
  }
  return fallback;
}

/**
 * Resolves a tier to its concrete provider entry + model id, failing fast when the
 * provider reference is unknown or the provider lacks an apiKey.
 */
export function resolveProviderEntry(
  normalized: NormalizedModelConfig,
  tier: ModelTier,
): ResolvedProviderEntry {
  const ref = normalized.models[tier];
  const entry = normalized.providers[ref.provider];
  if (entry === undefined) {
    throw new ModelConfigError(`unknown provider '${ref.provider}' for tier '${tier}'`);
  }
  if (entry.apiKey === undefined) {
    throw new ModelConfigError(`provider '${ref.provider}' requires an apiKey`);
  }
  return {
    providerName: ref.provider,
    kind: entry.kind ?? 'openai',
    baseUrl: entry.baseUrl,
    apiKey: entry.apiKey,
    timeoutMs: entryTimeoutMs(entry, normalized.defaultTimeoutMs),
    model: ref.model,
  };
}

/** Resolves the model id for a tier, failing fast on unresolved config. */
export function resolveModelId(normalized: NormalizedModelConfig, tier: ModelTier): string {
  return resolveProviderEntry(normalized, tier).model;
}


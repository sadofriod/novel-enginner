import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const MODEL_TIER_VALUES = ['flagship', 'balanced', 'economy'] as const;

export type ModelTier = (typeof MODEL_TIER_VALUES)[number];

/** Default model per tier, used when a tier has no explicit configuration. */
export const DEFAULT_OPENAI_MODEL_BY_TIER: Record<ModelTier, string> = {
  flagship: 'gpt-4.1',
  balanced: 'gpt-4.1-mini',
  economy: 'gpt-4.1-nano',
};

/** A named provider entry in the `providers` registry. `kind` is reserved for future vendors. */
export interface ProviderEntry {
  /** Provider vendor kind; `openai` (OpenAI-compatible) is the V1 implementation. */
  readonly kind?: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
  /** Per-provider request timeout override; falls back to the top-level `timeoutMs`. */
  readonly timeoutMs?: number;
}

/** Per-tier model reference in the `models` map. */
export interface TierModelRef {
  /** Provider name in the `providers` registry. */
  readonly provider: string;
  readonly model: string;
}

/**
 * Raw model provider configuration as read from `model.config.json`.
 *
 * Two shapes are accepted:
 * - **Legacy flat** (backward compatible): `{ provider, baseUrl, apiKey, timeoutMs, models: { tier: "model" } }`
 *   treated as a single implicit provider named `default`.
 * - **Multi-provider registry**: `{ providers: { <name>: ProviderEntry }, models: { tier: { provider, model } } }`
 *   where each tier may come from a different provider entry.
 */
export interface ModelConfig {
  /** Registry of named providers (multi-provider shape). */
  readonly providers?: Readonly<Record<string, ProviderEntry>>;
  /** Per-tier model refs; a plain string means the implicit `default` provider. */
  readonly models?: Partial<Record<ModelTier, TierModelRef | string>>;
  /** Legacy flat shape: provider vendor kind for the implicit `default` provider. */
  readonly provider?: string;
  /** Legacy flat shape: baseUrl for the implicit `default` provider. */
  readonly baseUrl?: string;
  /** Legacy flat shape: apiKey for the implicit `default` provider. */
  readonly apiKey?: string;
  /** Default request timeout in ms for providers that do not override it. */
  readonly timeoutMs?: number;
}

const DEFAULT_CONFIG_FILENAME = 'model.config.json';

function readConfigFile(path: string): ModelConfig | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as ModelConfig;
    return parsed !== null && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readFirstConfig(paths: readonly (string | undefined)[]): ModelConfig | undefined {
  for (const path of paths) {
    if (path === undefined) {
      continue;
    }
    const config = readConfigFile(path);
    if (config !== undefined) {
      return config;
    }
  }
  return undefined;
}

function explicitConfigPath(): string | undefined {
  const explicit = process.env['NOVEL_MODEL_CONFIG']?.trim();
  return explicit === undefined || explicit === '' ? undefined : explicit;
}

/**
 * Loads model provider configuration from a config file. Resolution order:
 * 1. `NOVEL_MODEL_CONFIG` env var (explicit file path)
 * 2. `<workspaceRoot>/model.config.json`
 * 3. `<cwd>/model.config.json` (repo default)
 *
 * The file supplies the provider's `apiKey`, `baseUrl`, and per-tier `models`
 * (模型名称 / key / baseURL), so LLM wiring no longer depends on hardcoded model ids.
 */
export function loadModelConfig(workspaceRoot?: string): ModelConfig | undefined {
  const candidates: (string | undefined)[] = [explicitConfigPath()];
  if (workspaceRoot !== undefined) {
    candidates.push(join(workspaceRoot, DEFAULT_CONFIG_FILENAME));
  }
  candidates.push(join(process.cwd(), DEFAULT_CONFIG_FILENAME));
  return readFirstConfig(candidates);
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ModelTier } from './provider';

export interface ModelConfig {
  readonly provider?: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
  /** Per-tier model identifiers (模型名称), keyed by `flagship` / `balanced` / `economy`. */
  readonly models?: Partial<Record<ModelTier, string>>;
  /** Request timeout in ms. */
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

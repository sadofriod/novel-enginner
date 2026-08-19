import { describe, expect, test } from 'bun:test';

import { MODEL_TIER_VALUES, type ModelConfig } from './model-config';
import {
  ModelConfigError,
  ModelConfigSchema,
  normalizeModelConfig,
  resolveModelId,
  resolveProviderEntry,
} from './model-resolver';

describe('normalizeModelConfig', () => {
  test('normalizes a legacy flat config into a default provider entry with per-tier refs', () => {
    const normalized = normalizeModelConfig(
      { baseUrl: 'https://legacy.test/v1', apiKey: 'k', timeoutMs: 5000, models: { flagship: 'm-1' } },
      {},
    );
    expect(normalized.providers['default']).toMatchObject({
      kind: 'openai',
      baseUrl: 'https://legacy.test/v1',
      apiKey: 'k',
      timeoutMs: 5000,
    });
    expect(normalized.models['flagship']).toEqual({ provider: 'default', model: 'm-1' });
    expect(normalized.models['balanced']).toEqual({ provider: 'default', model: 'gpt-4.1-mini' });
  });

  test('preserves a multi-provider registry config', () => {
    const config: ModelConfig = {
      providers: {
        local: { baseUrl: 'http://localhost:1234/v1', apiKey: 'lm' },
        cloud: { apiKey: 'ck' },
      },
      models: {
        flagship: { provider: 'local', model: 'gemma' },
        economy: { provider: 'cloud', model: 'qwen' },
      },
    };
    const normalized = normalizeModelConfig(config, {});
    expect(normalized.providers['local']?.apiKey).toBe('lm');
    expect(normalized.models['flagship']).toEqual({ provider: 'local', model: 'gemma' });
    expect(normalized.models['economy']).toEqual({ provider: 'cloud', model: 'qwen' });
  });

  test('falls back to env only for the default provider', () => {
    const normalized = normalizeModelConfig(
      { models: { flagship: 'm' } },
      {
        OPENAI_API_KEY: 'env-key',
        OPENAI_BASE_URL: 'https://env.test/v1',
        OPENAI_MODEL_ECONOMY: 'env-econ',
      },
    );
    expect(normalized.providers['default']).toMatchObject({ apiKey: 'env-key', baseUrl: 'https://env.test/v1' });
    expect(normalized.models['economy']).toEqual({ provider: 'default', model: 'env-econ' });
  });

  test('config values win over environment overrides', () => {
    const normalized = normalizeModelConfig(
      { apiKey: 'cfg-key', baseUrl: 'https://cfg.test', models: { flagship: 'cfg-model' } },
      { OPENAI_API_KEY: 'env-key', OPENAI_BASE_URL: 'https://env.test', OPENAI_MODEL_FLAGSHIP: 'env-model' },
    );
    expect(normalized.providers['default']?.apiKey).toBe('cfg-key');
    expect(normalized.providers['default']?.baseUrl).toBe('https://cfg.test');
    expect(normalized.models['flagship']).toEqual({ provider: 'default', model: 'cfg-model' });
  });

  test('assigns built-in default models to unconfigured tiers', () => {
    const normalized = normalizeModelConfig(undefined, {});
    expect(MODEL_TIER_VALUES.map((tier) => normalized.models[tier]?.provider)).toEqual(['default', 'default', 'default']);
    expect(normalized.models['flagship']?.model).toBe('gpt-4.1');
  });
});

describe('resolveProviderEntry / resolveModelId', () => {
  test('resolves a tier to its provider entry and model id', () => {
    const normalized = normalizeModelConfig(
      {
        providers: { local: { baseUrl: 'http://local:1234/v1', apiKey: 'k' } },
        models: { flagship: { provider: 'local', model: 'gemma-26b' } },
      },
      {},
    );
    const entry = resolveProviderEntry(normalized, 'flagship');
    expect(entry).toMatchObject({
      providerName: 'local',
      kind: 'openai',
      baseUrl: 'http://local:1234/v1',
      apiKey: 'k',
      model: 'gemma-26b',
    });
    expect(resolveModelId(normalized, 'flagship')).toBe('gemma-26b');
  });

  test('fails fast on an unknown provider reference', () => {
    const normalized = normalizeModelConfig(
      { providers: { local: { apiKey: 'k' } }, models: { flagship: { provider: 'nope', model: 'x' } } },
      {},
    );
    expect(() => resolveProviderEntry(normalized, 'flagship')).toThrow(ModelConfigError);
  });

  test('fails fast when the resolved provider lacks an apiKey', () => {
    const normalized = normalizeModelConfig(
      { providers: { local: {} }, models: { flagship: { provider: 'local', model: 'x' } } },
      {},
    );
    expect(() => resolveProviderEntry(normalized, 'flagship')).toThrow(ModelConfigError);
  });
});

describe('ModelConfigSchema', () => {
  test('accepts the multi-provider registry shape', () => {
    expect(
      ModelConfigSchema.safeParse({
        providers: { local: { baseUrl: 'http://localhost:1234/v1', apiKey: 'lm' } },
        models: { flagship: { provider: 'local', model: 'gemma' } },
      }).success,
    ).toBe(true);
  });

  test('accepts the legacy flat shape', () => {
    expect(ModelConfigSchema.safeParse({ baseUrl: 'https://x/v1', apiKey: 'k', models: { flagship: 'm' } }).success).toBe(
      true,
    );
  });

  test('rejects a structurally invalid shape', () => {
    expect(ModelConfigSchema.safeParse({ models: { flagship: 123 } }).success).toBe(false);
  });
});

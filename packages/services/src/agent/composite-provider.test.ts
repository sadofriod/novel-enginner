import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { buildCompositeProvider } from './composite-provider';
import { ModelConfigError } from './model-resolver';
import { OpenAiModelProvider, createDefaultModelProvider } from './provider';

const savedEnv = process.env['NOVEL_MODEL_CONFIG'];

afterEach(() => {
  if (savedEnv === undefined) {
    delete process.env['NOVEL_MODEL_CONFIG'];
  } else {
    process.env['NOVEL_MODEL_CONFIG'] = savedEnv;
  }
});

function registryConfig() {
  return {
    providers: {
      local: { apiKey: 'k', baseUrl: 'http://local:1234/v1' },
      cloud: { apiKey: 'ck', baseUrl: 'https://cloud.test/v1' },
    },
    models: {
      flagship: { provider: 'local', model: 'g-26b' },
      balanced: { provider: 'local', model: 'g-mini' },
      economy: { provider: 'cloud', model: 'q-0.5b' },
    },
  };
}

describe('buildCompositeProvider', () => {
  test('delegates model resolution and completion to the per-tier sub-provider', async () => {
    const flagship = new OpenAiModelProvider({ apiKey: 'k', modelByTier: { flagship: 'g-26b' } });
    const economy = new OpenAiModelProvider({ apiKey: 'k', modelByTier: { economy: 'q-0.5b' } });
    const provider = buildCompositeProvider({
      flagship: { provider: flagship, model: 'g-26b' },
      balanced: { provider: flagship, model: 'g-mini' },
      economy: { provider: economy, model: 'q-0.5b' },
    });
    expect(provider.providerId).toBe('composite');
    expect(provider.resolveModelId('flagship')).toBe('g-26b');
    expect(provider.resolveModelId('economy')).toBe('q-0.5b');
  });
});

describe('createDefaultModelProvider', () => {
  test('reads a multi-provider registry config and resolves each tier to its provider', async () => {
    const dir = await mkdtemp('/tmp/model-config-composite-');
    const configPath = join(dir, 'model.config.json');
    await writeFile(configPath, JSON.stringify(registryConfig()));
    process.env['NOVEL_MODEL_CONFIG'] = configPath;
    try {
      const provider = createDefaultModelProvider({});
      expect(provider.providerId).toBe('composite');
      expect(provider.resolveModelId('flagship')).toBe('g-26b');
      expect(provider.resolveModelId('balanced')).toBe('g-mini');
      expect(provider.resolveModelId('economy')).toBe('q-0.5b');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('routes each tier request to its provider baseUrl and model id', async () => {
    const dir = await mkdtemp('/tmp/model-config-routing-');
    const configPath = join(dir, 'model.config.json');
    await writeFile(configPath, JSON.stringify(registryConfig()));
    process.env['NOVEL_MODEL_CONFIG'] = configPath;

    const previousFetch = globalThis.fetch;
    const calls: Array<{ url: string; model: string }> = [];
    globalThis.fetch = (async (input, init) => {
      const request = new Request(input, init);
      const body = (await request.json()) as { model?: string };
      calls.push({ url: request.url, model: body.model ?? '' });
      return new Response(
        JSON.stringify({
          choices: [{ index: 0, message: { content: 'ok' }, finish_reason: 'stop' }],
          model: body.model,
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    try {
      const provider = createDefaultModelProvider({});
      await provider.complete({ tier: 'flagship', prompt: 'a' });
      await provider.complete({ tier: 'economy', prompt: 'b' });
      expect(calls[0]?.url).toContain('http://local:1234');
      expect(calls[0]?.model).toBe('g-26b');
      expect(calls[1]?.url).toContain('https://cloud.test');
      expect(calls[1]?.model).toBe('q-0.5b');
    } finally {
      globalThis.fetch = previousFetch;
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('fails fast on an unknown provider reference', async () => {
    const dir = await mkdtemp('/tmp/model-config-unknown-');
    const configPath = join(dir, 'model.config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        providers: { local: { apiKey: 'k' } },
        models: { flagship: { provider: 'nope', model: 'x' } },
      }),
    );
    process.env['NOVEL_MODEL_CONFIG'] = configPath;
    try {
      expect(() => createDefaultModelProvider({})).toThrow(ModelConfigError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadModelConfig } from './model-config';

const savedEnv = process.env['NOVEL_MODEL_CONFIG'];

afterEach(() => {
  if (savedEnv === undefined) {
    delete process.env['NOVEL_MODEL_CONFIG'];
  } else {
    process.env['NOVEL_MODEL_CONFIG'] = savedEnv;
  }
});

describe('loadModelConfig', () => {
  test('loads from an explicit NOVEL_MODEL_CONFIG path', async () => {
    const dir = await mkdtemp('/tmp/model-config-explicit-');
    const configPath = join(dir, 'custom.json');
    await writeFile(configPath, JSON.stringify({ baseUrl: 'https://explicit.test/v1', apiKey: 'k', timeoutMs: 600000, models: { balanced: 'local-model' } }));
    process.env['NOVEL_MODEL_CONFIG'] = configPath;
    try {
      expect(loadModelConfig()).toMatchObject({ baseUrl: 'https://explicit.test/v1', apiKey: 'k', timeoutMs: 600000, models: { balanced: 'local-model' } });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('prefers the workspace-root config over the repo default', async () => {
    const dir = await mkdtemp('/tmp/model-config-workspace-');
    await mkdir(join(dir, 'state'), { recursive: true });
    await writeFile(join(dir, 'model.config.json'), JSON.stringify({ baseUrl: 'https://workspace.test/v1', models: { flagship: 'ws-model' } }));
    try {
      expect(loadModelConfig(dir)).toMatchObject({ baseUrl: 'https://workspace.test/v1', models: { flagship: 'ws-model' } });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('falls back to the repo default when the workspace has no config', () => {
    expect(loadModelConfig('/nonexistent-workspace')).toMatchObject({ baseUrl: 'http://127.0.0.1:1234/v1', apiKey: 'LM-studio' });
  });
});

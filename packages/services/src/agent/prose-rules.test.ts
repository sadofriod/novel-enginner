import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { formatBannedTermsHardRules, isProseArtifactType, loadProsePolicyLayers } from './prose-rules';

describe('prose artifact classification', () => {
  test('classifies chapter-manuscript as a prose artifact', () => {
    expect(isProseArtifactType('chapter-manuscript')).toBe(true);
  });

  test('does not classify outlines as prose artifacts', () => {
    expect(isProseArtifactType('chapter-outline')).toBe(false);
    expect(isProseArtifactType('volume-outline')).toBe(false);
  });
});

describe('formatBannedTermsHardRules', () => {
  test('renders paragraph bounds and every banned term as hard rules', () => {
    const text = formatBannedTermsHardRules({
      paragraphMinChars: 50,
      paragraphMaxChars: 150,
      bannedTerms: ['仿佛', '难以言喻'],
    });
    expect(text).toContain('50-150 字');
    expect(text).toContain('仿佛');
    expect(text).toContain('难以言喻');
    expect(text).toContain('硬失败');
  });
});

describe('loadProsePolicyLayers', () => {
  test('loads banned terms as hard rules and the anti-AI voice body as policy', async () => {
    const root = await mkdtemp('/tmp/novel-prose-rules-');
    await mkdir(join(root, 'state/reviewer'), { recursive: true });
    await mkdir(join(root, 'prompts'), { recursive: true });
    await writeFile(
      join(root, 'state/reviewer/rules.json'),
      JSON.stringify({ paragraphMinChars: 50, paragraphMaxChars: 150, bannedTerms: ['仿佛'] }),
    );
    await writeFile(
      join(root, 'prompts/anti-ai-voice.prompt.md'),
      '---\nname: anti-ai-voice\n---\n具象优先：用动作和细节推进叙事。\n',
    );
    try {
      const layers = await loadProsePolicyLayers(root);
      expect(layers.systemHardRules).toContain('仿佛');
      expect(layers.projectPolicy).toContain('具象优先');
      expect(layers.projectPolicy).not.toContain('name:');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

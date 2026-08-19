import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { formatBannedTermsHardRules, isProseArtifactType, loadProsePolicyLayers } from './prose-rules';

describe('prose artifact classification', () => {
  test('classifies chapter-manuscript as a prose artifact', () => {
    expect(isProseArtifactType('chapter-manuscript')).toBe(true);
  });

  test('classifies outline artifacts as prose-rule artifacts so density rules apply', () => {
    expect(isProseArtifactType('chapter-outline')).toBe(true);
    expect(isProseArtifactType('volume-outline')).toBe(true);
  });

  test('does not classify entity-patch artifacts as prose artifacts', () => {
    expect(isProseArtifactType('character-update')).toBe(false);
    expect(isProseArtifactType('world-change')).toBe(false);
  });
});

describe('formatBannedTermsHardRules', () => {
  test('renders paragraph bounds and every banned term as hard rules', () => {
    const text = formatBannedTermsHardRules({
      paragraphMinChars: 50,
      paragraphMaxChars: 150,
      bannedTerms: ['仿佛', '难以言喻'],
      densityMaxConsecutiveParagraphs: 12,
      densityMaxParagraphRatio: 0.75,
      densityMinParagraphs: 4,
      outlineFieldMaxChars: 80,
    });
    expect(text).toContain('50-150 字');
    expect(text).toContain('仿佛');
    expect(text).toContain('难以言喻');
    expect(text).toContain('硬失败');
  });

  test('renders the description-density hard rule so generators see it', () => {
    const text = formatBannedTermsHardRules({
      paragraphMinChars: 50,
      paragraphMaxChars: 150,
      bannedTerms: [],
      densityMaxConsecutiveParagraphs: 12,
      densityMaxParagraphRatio: 0.75,
      densityMinParagraphs: 4,
      outlineFieldMaxChars: 80,
    });
    expect(text).toContain('描写密度');
    expect(text).toContain('连续');
    expect(text).toContain('0.75');
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

  test('the canonical anti-AI voice prompt carries the density restraint', async () => {
    const raw = await readFile(new URL('../../../../prompts/anti-ai-voice.prompt.md', import.meta.url), 'utf8');
    expect(raw).toContain('密度克制');
    expect(raw).toContain('description-density');
    expect(raw).toContain('纯动作-场景堆砌');
  });
});

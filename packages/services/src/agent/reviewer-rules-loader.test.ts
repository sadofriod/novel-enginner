import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { detectRuleHardFailures } from './reviewer';
import { loadReviewerRules } from './reviewer-rules-loader';

describe('loadReviewerRules', () => {
  test('loads canonical reviewer thresholds rather than silently using defaults', async () => {
    const root = await mkdtemp('/tmp/novel-reviewer-rules-');
    await mkdir(join(root, 'state/reviewer'), { recursive: true });
    await Bun.write(join(root, 'state/reviewer/rules.json'), JSON.stringify({ paragraphMinChars: 40, paragraphMaxChars: 200, bannedTerms: ['forbidden'] }));
    try {
      const rules = await loadReviewerRules(root);
      expect(rules).toMatchObject({ paragraphMinChars: 40, paragraphMaxChars: 200, bannedTerms: ['forbidden'] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('fails when the canonical reviewer rules file is unavailable', async () => {
    const root = await mkdtemp('/tmp/novel-reviewer-rules-');
    try {
      await expect(loadReviewerRules(root)).rejects.toThrow('rules.json');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('real repository AI-flavor banned terms', () => {
  // docs/architecture/modules/05-reviewer-and-quality-gates.md §5.2/§5.5: the
  // project-level blacklist is machine-enforced from state/reviewer/rules.json.
  test('loads at least 25 high-signal AI-flavor banned terms', async () => {
    const rules = await loadReviewerRules(process.cwd());
    expect(rules.bannedTerms.length).toBeGreaterThanOrEqual(25);
    expect(rules.bannedTerms).toContain('仿佛');
    expect(rules.bannedTerms).toContain('不禁');
    expect(rules.bannedTerms).toContain('深邃');
    expect(rules.bannedTerms).toContain('难以言喻');
    expect(rules.bannedTerms).toContain('这一刻');
  });

  test('real rules make detectRuleHardFailures flag banned-terms-hit', async () => {
    const rules = await loadReviewerRules(process.cwd());
    const failures = detectRuleHardFailures('她仿佛看见了什么，心头一紧，难以言喻。', rules);
    expect(failures.map((failure) => failure.code)).toContain('banned-terms-hit');
  });
});
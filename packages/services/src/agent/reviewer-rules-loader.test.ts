import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

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
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseReviewerRules, type ReviewerRuleThresholds } from './reviewer';

export async function loadReviewerRules(workspaceRoot: string): Promise<ReviewerRuleThresholds> {
  const path = join(workspaceRoot, 'state/reviewer/rules.json');
  try {
    return parseReviewerRules(await readFile(path, 'utf8'));
  } catch (cause) {
    throw new Error(`Unable to load canonical reviewer rules at ${path}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}
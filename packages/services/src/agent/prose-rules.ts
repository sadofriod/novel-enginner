/**
 * Prose-artifact rule injection, per
 * docs/architecture/modules/05-reviewer-and-quality-gates.md §5.5: banned terms
 * and thresholds are machine-enforced from `state/reviewer/rules.json`, and the
 * anti-AI style guidance lives in `prompts/anti-ai-voice.prompt.md`.
 *
 * For prose artifacts (chapter-manuscript generation, rewrite, and optimize) these
 * land in the `system-hard-rules` and `project-policy` prompt layers so every
 * prose product is constrained by the same rules the Reviewer enforces.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ReviewerRuleThresholds } from './reviewer';
import { DEFAULT_REVIEWER_RULE_THRESHOLDS } from './reviewer';
import { loadReviewerRules } from './reviewer-rules-loader';
import { stripAgentFrontmatter } from './role-template';

export const PROSE_ARTIFACT_TYPES = ['chapter-manuscript'] as const;

export type ProseArtifactType = (typeof PROSE_ARTIFACT_TYPES)[number];

export const FALLBACK_SYSTEM_RULES = 'Return only work relevant to the requested artifact.';
export const FALLBACK_PROJECT_POLICY = 'Canonical Markdown is the source of truth; do not invent missing facts.';

/** Resolves the effective system-hard-rules, preferring explicit input, then prose rules. */
export function resolveSystemRules(explicit: string | undefined, prose: ProsePolicyLayers | undefined): string {
  if (explicit !== undefined) {
    return explicit;
  }
  if (prose !== undefined) {
    return prose.systemHardRules;
  }
  return FALLBACK_SYSTEM_RULES;
}

/** Resolves the effective project-policy, preferring explicit input, then prose rules. */
export function resolveProjectPolicy(explicit: string | undefined, prose: ProsePolicyLayers | undefined): string {
  if (explicit !== undefined) {
    return explicit;
  }
  if (prose !== undefined) {
    return prose.projectPolicy;
  }
  return FALLBACK_PROJECT_POLICY;
}

export function isProseArtifactType(artifactType: string): boolean {
  return (PROSE_ARTIFACT_TYPES as readonly string[]).includes(artifactType);
}

/** Renders the machine-enforced banned terms and paragraph bounds as hard rules. */
export function formatBannedTermsHardRules(rules: ReviewerRuleThresholds): string {
  return [
    '硬规则（不得违反，命中即判硬失败）：',
    `- 段落长度 ${rules.paragraphMinChars}-${rules.paragraphMaxChars} 字。`,
    `- 禁词：${rules.bannedTerms.join('、')}。`,
  ].join('\n');
}

export interface ProsePolicyLayers {
  readonly systemHardRules: string;
  readonly projectPolicy: string;
}

async function readRulesSafely(workspaceRoot: string): Promise<ReviewerRuleThresholds> {
  try {
    return await loadReviewerRules(workspaceRoot);
  } catch {
    return DEFAULT_REVIEWER_RULE_THRESHOLDS;
  }
}

async function readStyleSafely(workspaceRoot: string): Promise<string> {
  try {
    const raw = await readFile(join(workspaceRoot, 'prompts/anti-ai-voice.prompt.md'), 'utf8');
    return stripAgentFrontmatter(raw);
  } catch {
    return '正文遵循去 AI 味文风：具象优先、拒绝模板化描写。';
  }
}

/**
 * Loads the prose policy layers for a workspace. Missing sources degrade to safe
 * defaults so a prose task never fails on an incomplete local workspace, while
 * canonical rules still apply whenever the files exist.
 */
export async function loadProsePolicyLayers(workspaceRoot: string): Promise<ProsePolicyLayers> {
  const [rules, projectPolicy] = await Promise.all([readRulesSafely(workspaceRoot), readStyleSafely(workspaceRoot)]);
  return {
    systemHardRules: formatBannedTermsHardRules(rules),
    projectPolicy,
  };
}

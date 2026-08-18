import { z } from 'zod';

import { DimensionScoresSchema, ReviewHardFailureSchema } from '../domain/schema';
import { REVIEW_HARD_FAILURE_VALUES } from '../domain/values';
import type { ModelProvider } from './provider';
import type { ModelEvidence } from './reviewer';

const ModelEvidenceSchema = z.object({
  hardFailures: z.array(ReviewHardFailureSchema).readonly(),
  dimensionScores: DimensionScoresSchema,
  rewriteDirectives: z.array(z.string().trim().min(1)).readonly(),
}).readonly();

/** The 8 scoring dimensions the schema requires; kept in sync with `DimensionScoresSchema`. */
const DIMENSION_KEYS = [
  'antiAiVoice',
  'webFictionPacing',
  'emotionCurve',
  'characterConsistency',
  'settingConsistency',
  'clueCausality',
  'readabilityLayout',
  'languageTexture',
] as const;

const MAX_RAW_PREVIEW_LENGTH = 500;
const FENCE_PATTERN = /^```(?:json)?\s*\n([\s\S]*?)\n?```\s*$/i;

/** Truncates the raw model output so a parse failure stays debuggable without flooding the log. */
function previewRaw(raw: string): string {
  return raw.length > MAX_RAW_PREVIEW_LENGTH ? `${raw.slice(0, MAX_RAW_PREVIEW_LENGTH)}…` : raw;
}

/** Strips a markdown fenced code block (\`\`\`json … \`\`\`) when the model wraps its JSON response. */
function extractJsonBody(raw: string): string {
  const fenced = FENCE_PATTERN.exec(raw.trim());
  if (fenced === null) {
    return raw.trim();
  }
  const body = fenced[1];
  return body === undefined ? raw.trim() : body.trim();
}

function parseJsonOrThrow(body: string, raw: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error(`Reviewer model evidence must be valid JSON.\nRaw model output:\n${previewRaw(raw)}`);
  }
}

/**
 * Parses reviewer model evidence, tolerating markdown-fenced JSON. On failure the
 * thrown error carries the raw model output so the logger shows the real cause
 * instead of a bare parse-failure signal.
 */
export function parseReviewerModelEvidence(raw: string): ModelEvidence {
  const body = extractJsonBody(raw);
  const parsed = parseJsonOrThrow(body, raw);
  try {
    return ModelEvidenceSchema.parse(parsed);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Reviewer model evidence failed schema validation: ${detail}\nRaw model output:\n${previewRaw(raw)}`);
  }
}

/**
 * Reviews prose with the model, requesting a schema-valid JSON object. The prompt
 * enumerates the exact dimension keys and hard-failure codes (and targets AI-flavor
 * filler), so local models return parseable evidence instead of generic dimensions
 * that previously made the reviewer look ineffective.
 */
export async function requestReviewerModelEvidence(
  provider: ModelProvider,
  artifactType: string,
  text: string,
  roleTemplate?: string,
): Promise<ModelEvidence> {
  const dimensionTemplate = DIMENSION_KEYS.map((key) => `"${key}":<0-100>`).join(',');
  const failureCodes = REVIEW_HARD_FAILURE_VALUES.join(', ');
  const system = roleTemplate === undefined
    ? 'You are a strict fiction reviewer for Chinese web novels. Return JSON only, without markdown fences.'
    : `${roleTemplate}\n\nYou are the Reviewer role defined above. Return JSON only, without markdown fences.`;
  const completion = await provider.complete({
    tier: 'balanced',
    system,
    prompt: `Review this ${artifactType} and return JSON (no markdown fences) shaped exactly as:
{"hardFailures":[{"code":"<one of: ${failureCodes}>","message":"<reason>"}],"dimensionScores":{${dimensionTemplate}},"rewriteDirectives":["<concise actionable instruction>"]}
Score every dimension 0-100. Flag AI-flavor filler (仿佛/宛如/深邃/不禁/心头一紧/难以言喻/这一刻) and empty scenic description as banned-terms-hit or exposition-overload hard failures. Use empty arrays when nothing applies.\n\n${text}`,
  });
  return parseReviewerModelEvidence(completion.text);
}
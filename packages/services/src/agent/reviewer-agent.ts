import { z } from 'zod';

import { DimensionScoresSchema, ReviewHardFailureSchema } from '../domain/schema';
import type { ModelProvider } from './provider';
import type { ModelEvidence } from './reviewer';

const ModelEvidenceSchema = z.object({
  hardFailures: z.array(ReviewHardFailureSchema).readonly(),
  dimensionScores: DimensionScoresSchema,
  rewriteDirectives: z.array(z.string().trim().min(1)).readonly(),
}).readonly();

export function parseReviewerModelEvidence(raw: string): ModelEvidence {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Reviewer model evidence must be valid JSON.');
  }
  return ModelEvidenceSchema.parse(parsed);
}

export async function requestReviewerModelEvidence(
  provider: ModelProvider,
  artifactType: string,
  text: string,
): Promise<ModelEvidence> {
  const completion = await provider.complete({
    tier: 'balanced',
    system: 'You are a strict fiction reviewer. Return JSON only.',
    prompt: `Review this ${artifactType} and return exactly {"hardFailures":[],"dimensionScores":{},"rewriteDirectives":[]} with every score from 0 to 100.\n\n${text}`,
  });
  return parseReviewerModelEvidence(completion.text);
}
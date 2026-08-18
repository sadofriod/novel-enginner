import { z } from 'zod';

import {
  MANUAL_RISK_VALUES,
  REVIEW_FRESHNESS_VALUES,
  REVIEW_HARD_FAILURE_VALUES,
  WORKSPACE_VALIDITY_VALUES,
} from '../values';

import { NonEmptyStringSchema, ScoreSchema, StableIdSchema } from './common';

export const ReviewHardFailureSchema = z
  .object({
    code: z.enum(REVIEW_HARD_FAILURE_VALUES),
    message: NonEmptyStringSchema,
  })
  .readonly();

export const DimensionScoresSchema = z
  .object({
    antiAiVoice: ScoreSchema,
    webFictionPacing: ScoreSchema,
    emotionCurve: ScoreSchema,
    characterConsistency: ScoreSchema,
    settingConsistency: ScoreSchema,
    clueCausality: ScoreSchema,
    readabilityLayout: ScoreSchema,
    languageTexture: ScoreSchema,
  })
  .readonly();

export const ReviewerResultSchema = z
  .object({
    approved: z.boolean(),
    hardFailures: z.array(ReviewHardFailureSchema).readonly(),
    dimensionScores: DimensionScoresSchema,
    totalScore: ScoreSchema,
    rewriteDirectives: z.array(NonEmptyStringSchema).readonly(),
    overrideEligible: z.boolean(),
    /** Provenance of the review evidence: `model` = real LLM evidence, `rules` = deterministic rules only (or absent). */
    evidenceSource: z.enum(['model', 'rules']).optional(),
  })
  .readonly();

export const OverrideAuditSchema = z
  .object({
    overrideReason: NonEmptyStringSchema,
    overrideBy: StableIdSchema,
    relatedRunId: StableIdSchema,
    failedChecks: z.array(ReviewHardFailureSchema).readonly(),
    scoreSnapshot: ReviewerResultSchema,
    timestamp: NonEmptyStringSchema,
  })
  .readonly();

export const ReviewFreshnessStateSchema = z
  .object({
    status: z.enum(REVIEW_FRESHNESS_VALUES),
    lastReviewedAt: NonEmptyStringSchema.optional(),
    sourceArtifactId: StableIdSchema.optional(),
  })
  .readonly();

export const ManualRiskStateSchema = z
  .object({
    level: z.enum(MANUAL_RISK_VALUES),
    reason: NonEmptyStringSchema.optional(),
    artifactId: StableIdSchema.optional(),
  })
  .readonly();

export const WorkspaceValidityStateSchema = z
  .object({
    state: z.enum(WORKSPACE_VALIDITY_VALUES),
    reason: NonEmptyStringSchema.optional(),
    lastKnownGoodSnapshot: StableIdSchema.optional(),
  })
  .readonly();

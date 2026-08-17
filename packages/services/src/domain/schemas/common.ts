import { z } from 'zod';

export const StableIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const NonEmptyStringSchema = z.string().trim().min(1);
export const PositiveIntegerSchema = z.number().int().positive();
export const ScoreSchema = z.number().int().min(0).max(100);
export const ConfidenceSchema = z.number().min(0).max(1);

export const EntityVersionRefSchema = z
  .object({
    entityId: StableIdSchema,
    version: StableIdSchema,
  })
  .readonly();

export const DefaultChapterTypePolicySchema = z
  .object({
    maxConsecutiveSamePrimaryType: PositiveIntegerSchema,
  })
  .readonly();

import { z } from 'zod';

import {
  CAPABILITY_KIND_VALUES,
  CAPABILITY_REGISTRATION_STATUS_VALUES,
} from './values';

const StableIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const NonEmptyStringSchema = z.string().trim().min(1);
const PositiveIntegerSchema = z.number().int().positive();

export const ReviewerRulesSchema = z
  .object({
    paragraphMinChars: PositiveIntegerSchema.optional(),
    paragraphMaxChars: PositiveIntegerSchema.optional(),
    bannedTerms: z.array(NonEmptyStringSchema).readonly().optional(),
    maxRewriteRounds: PositiveIntegerSchema.optional(),
    contextWindowChapters: PositiveIntegerSchema.optional(),
  })
  .catchall(z.unknown())
  .readonly();

export const VocabularyEntrySchema = z
  .object({
    id: StableIdSchema,
    term: NonEmptyStringSchema,
    aliases: z.array(NonEmptyStringSchema).readonly().optional(),
    definition: NonEmptyStringSchema.optional(),
    notes: NonEmptyStringSchema.optional(),
  })
  .readonly();

export const VocabularyRegistrySchema = z
  .object({
    entries: z.array(VocabularyEntrySchema).readonly().optional(),
    vocabularies: z.array(VocabularyEntrySchema).readonly().optional(),
    version: StableIdSchema.optional(),
  })
  .catchall(z.unknown())
  .readonly();

export const CapabilityRegistryEntrySchema = z
  .object({
    id: StableIdSchema,
    type: z.enum(CAPABILITY_KIND_VALUES),
    enabled: z.boolean().optional(),
    visibility: z.enum(['public', 'restricted']).optional(),
    allowedAgents: z.array(z.string()).readonly().optional(),
    applicableArtifactTypes: z.array(NonEmptyStringSchema).readonly().optional(),
  })
  .readonly();

export const CapabilityRegistrySchema = z
  .object({
    capabilities: z.array(CapabilityRegistryEntrySchema).readonly(),
  })
  .readonly();

export const CapabilityRegistrationStateSchema = z
  .object({
    status: z.enum(CAPABILITY_REGISTRATION_STATUS_VALUES),
    capabilityId: StableIdSchema.optional(),
    source: NonEmptyStringSchema.optional(),
    details: NonEmptyStringSchema.optional(),
  })
  .readonly();

export type ReviewerRules = z.infer<typeof ReviewerRulesSchema>;
export type VocabularyEntry = z.infer<typeof VocabularyEntrySchema>;
export type VocabularyRegistry = z.infer<typeof VocabularyRegistrySchema>;
export type CapabilityRegistryEntry = z.infer<typeof CapabilityRegistryEntrySchema>;
export type CapabilityRegistry = z.infer<typeof CapabilityRegistrySchema>;
export type CapabilityRegistrationState = z.infer<typeof CapabilityRegistrationStateSchema>;

import { z } from 'zod';

/**
 * Canonical artifact schemas for project-brief, world-foundation, and story-blueprint.
 * Used for validation and API contracts per doc 11.5.
 */

// project-brief schema
export const ProjectBriefSchema = z.object({
  id: z.string().min(1),
  bookId: z.string().min(1),
  title: z.string().min(1),
  genres: z.array(z.string()).nonempty(),
  targetAudience: z.string().min(1),
  marketScope: z.string().min(1),
  readerPromise: z.string().min(1),
  corePremise: z.string().min(1),
  openingHook: z.string().min(1),
  contentBoundaries: z.string().min(1),
  format: z.string().min(1),
  sourceResearchEvidenceIds: z.array(z.string()),
  assumptionIds: z.array(z.string()).optional(),
  status: z.enum(['draft', 'active', 'archived']),
  extensions: z.record(z.unknown()).optional(),
});

export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;

// world-foundation schema
export const WorldFoundationSchema = z.object({
  id: z.string().min(1),
  bookId: z.string().min(1),
  eraAndPrimarySetting: z.string().min(1),
  realityMode: z.enum(['realistic', 'fantastical', 'magical', 'sci-fi']),
  tone: z.string().min(1),
  capabilitySystem: z.string().optional(),
  immutableRules: z.array(z.string()).min(1),
  socialOrder: z.string().optional(),
  narrativeProhibitions: z.array(z.string()).optional(),
  terminologyRefs: z.array(z.string()).optional(),
  projectBriefRef: z.string(),
  status: z.enum(['draft', 'active', 'archived']),
  extensions: z.record(z.unknown()).optional(),
});

export type WorldFoundation = z.infer<typeof WorldFoundationSchema>;

// story-blueprint schema
export const StoryBlueprintSchema = z.object({
  id: z.string().min(1),
  bookId: z.string().min(1),
  projectBriefRef: z.string(),
  worldFoundationRef: z.string(),
  protagonistArc: z.string().min(1),
  centralConflict: z.string().min(1),
  opposition: z.string().min(1),
  resolutionDirection: z.string().min(1),
  volumePlan: z.record(z.string()).optional(),
  crossVolumeCommitments: z.array(z.string()).optional(),
  estimatedVolumeCount: z.number().int().positive(),
  status: z.enum(['draft', 'active', 'archived']),
  extensions: z.record(z.unknown()).optional(),
});

export type StoryBlueprint = z.infer<typeof StoryBlueprintSchema>;

export function validateProjectBrief(data: unknown): ProjectBrief {
  return ProjectBriefSchema.parse(data);
}

export function validateWorldFoundation(data: unknown): WorldFoundation {
  return WorldFoundationSchema.parse(data);
}

export function validateStoryBlueprint(data: unknown): StoryBlueprint {
  return StoryBlueprintSchema.parse(data);
}

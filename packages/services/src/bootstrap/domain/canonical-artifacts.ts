import { z } from 'zod';

const stableId = z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const positiveInt = z.number().int().positive();
const nonEmpty = z.string().trim().min(1);

export const ProjectBriefSchema = z
  .object({
    id: stableId,
    bookId: stableId,
    title: nonEmpty,
    genres: z.array(nonEmpty).min(1).readonly(),
    targetAudience: nonEmpty,
    marketScope: nonEmpty,
    readerPromise: nonEmpty,
    corePremise: nonEmpty,
    openingHook: nonEmpty,
    contentBoundaries: z.array(nonEmpty).readonly(),
    format: nonEmpty,
    sourceResearchEvidenceIds: z.array(stableId).readonly(),
    assumptionIds: z.array(stableId).readonly(),
    status: z.enum(['draft', 'approved', 'superseded', 'archived']),
    extensions: z.record(z.unknown()).optional(),
  })
  .readonly();

export const WorldFoundationSchema = z
  .object({
    id: stableId,
    bookId: stableId,
    eraAndPrimarySetting: nonEmpty,
    realityMode: nonEmpty,
    tone: nonEmpty,
    capabilitySystem: nonEmpty,
    immutableRules: z.array(nonEmpty).readonly(),
    socialOrder: nonEmpty,
    narrativeProhibitions: z.array(nonEmpty).readonly(),
    terminologyRefs: z.array(stableId).readonly(),
    projectBriefRef: stableId,
    status: z.enum(['draft', 'approved', 'superseded', 'archived']),
    extensions: z.record(z.unknown()).optional(),
  })
  .readonly();

export const StoryBlueprintSchema = z
  .object({
    id: stableId,
    bookId: stableId,
    projectBriefRef: stableId,
    worldFoundationRef: stableId,
    protagonistArc: nonEmpty,
    centralConflict: nonEmpty,
    opposition: nonEmpty,
    resolutionDirection: nonEmpty,
    volumePlan: z.array(nonEmpty).readonly(),
    crossVolumeCommitments: z.array(nonEmpty).readonly(),
    estimatedVolumeCount: positiveInt,
    status: z.enum(['draft', 'approved', 'superseded', 'archived']),
    extensions: z.record(z.unknown()).optional(),
  })
  .readonly();

export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;
export type WorldFoundation = z.infer<typeof WorldFoundationSchema>;
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

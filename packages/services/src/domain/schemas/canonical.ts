import { z } from 'zod';

import {
  BOOK_STATUS_VALUES,
  CANONICAL_ARTIFACT_STATUS_VALUES,
  VOLUME_STATUS_VALUES,
} from '../values';

import {
  DefaultChapterTypePolicySchema,
  NonEmptyStringSchema,
  PositiveIntegerSchema,
  StableIdSchema,
} from './common';

export const BookSchema = z
  .object({
    id: StableIdSchema,
    title: NonEmptyStringSchema,
    status: z.enum(BOOK_STATUS_VALUES),
    activeVolumeId: StableIdSchema.optional(),
    latestCanonicalVersion: StableIdSchema,
    globalPromises: z.array(StableIdSchema).readonly(),
    globalConstraints: z.array(StableIdSchema).readonly(),
    defaultChapterTypePolicy: DefaultChapterTypePolicySchema,
  })
  .readonly();

export const ProjectBriefSchema = z
  .object({
    id: StableIdSchema,
    bookId: StableIdSchema,
    title: NonEmptyStringSchema,
    genres: z.array(NonEmptyStringSchema).min(1).readonly(),
    targetAudience: NonEmptyStringSchema,
    marketScope: NonEmptyStringSchema,
    readerPromise: NonEmptyStringSchema,
    corePremise: NonEmptyStringSchema,
    openingHook: NonEmptyStringSchema,
    contentBoundaries: z.array(NonEmptyStringSchema).readonly(),
    format: NonEmptyStringSchema,
    sourceResearchEvidenceIds: z.array(StableIdSchema).readonly(),
    assumptionIds: z.array(StableIdSchema).readonly(),
    status: z.enum(CANONICAL_ARTIFACT_STATUS_VALUES),
    extensions: z.record(z.unknown()).optional(),
  })
  .readonly();

export const WorldFoundationSchema = z
  .object({
    id: StableIdSchema,
    bookId: StableIdSchema,
    eraAndPrimarySetting: NonEmptyStringSchema,
    realityMode: NonEmptyStringSchema,
    tone: NonEmptyStringSchema,
    capabilitySystem: NonEmptyStringSchema,
    immutableRules: z.array(NonEmptyStringSchema).readonly(),
    socialOrder: NonEmptyStringSchema,
    narrativeProhibitions: z.array(NonEmptyStringSchema).readonly(),
    terminologyRefs: z.array(StableIdSchema).readonly(),
    projectBriefRef: StableIdSchema,
    status: z.enum(CANONICAL_ARTIFACT_STATUS_VALUES),
    extensions: z.record(z.unknown()).optional(),
  })
  .readonly();

export const StoryBlueprintSchema = z
  .object({
    id: StableIdSchema,
    bookId: StableIdSchema,
    projectBriefRef: StableIdSchema,
    worldFoundationRef: StableIdSchema,
    protagonistArc: NonEmptyStringSchema,
    centralConflict: NonEmptyStringSchema,
    opposition: NonEmptyStringSchema,
    resolutionDirection: NonEmptyStringSchema,
    volumePlan: z.array(NonEmptyStringSchema).readonly(),
    crossVolumeCommitments: z.array(NonEmptyStringSchema).readonly(),
    estimatedVolumeCount: PositiveIntegerSchema,
    status: z.enum(CANONICAL_ARTIFACT_STATUS_VALUES),
    extensions: z.record(z.unknown()).optional(),
  })
  .readonly();

export const VolumeSchema = z
  .object({
    id: StableIdSchema,
    title: NonEmptyStringSchema,
    status: z.enum(VOLUME_STATUS_VALUES),
    sequenceNumber: PositiveIntegerSchema,
    goal: NonEmptyStringSchema,
    stage: NonEmptyStringSchema,
    chapterRoster: z.array(StableIdSchema).readonly(),
    targetChapterCount: PositiveIntegerSchema,
    requiredCluePayoffs: z.array(StableIdSchema).readonly(),
    milestones: z.array(StableIdSchema).readonly(),
  })
  .readonly();

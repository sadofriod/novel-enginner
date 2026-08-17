import { z } from 'zod';

import {
  CANONICAL_ARTIFACT_STATUS_VALUES,
  CHAPTER_TYPE_VALUES,
  EMOTION_CURVE_STAGE_TYPE_VALUES,
  TARGET_READER_EFFECT_VALUES,
} from '../values';

import { NonEmptyStringSchema, PositiveIntegerSchema, StableIdSchema } from './common';

export const SceneParticipantStateSchema = z
  .object({
    locationDetail: NonEmptyStringSchema.optional(),
    injuryState: NonEmptyStringSchema.optional(),
    goalState: NonEmptyStringSchema.optional(),
    heldResourceIds: z.array(StableIdSchema).readonly().optional(),
    knowledgeDeltaFactIds: z.array(StableIdSchema).readonly().optional(),
  })
  .readonly();

export const SceneStateSliceSchema = z
  .object({
    participantStates: z.record(SceneParticipantStateSchema).readonly().optional(),
    activeClueIds: z.array(StableIdSchema).readonly().optional(),
    constraintIds: z.array(StableIdSchema).readonly().optional(),
    threatLevel: z.number().int().min(1).max(5).optional(),
  })
  .readonly();

export const SceneSkeletonSchema = z
  .object({
    id: StableIdSchema,
    purpose: NonEmptyStringSchema,
    locationId: StableIdSchema,
    participantCharacterIds: z.array(StableIdSchema).readonly(),
    entryState: SceneStateSliceSchema.optional(),
    exitState: SceneStateSliceSchema.optional(),
  })
  .readonly();

export const EmotionCurveStageSchema = z
  .object({
    id: StableIdSchema,
    stageType: z.enum(EMOTION_CURVE_STAGE_TYPE_VALUES),
    emotionIntensity: z.number().int().min(1).max(5),
    targetReaderEffects: z.array(z.enum(TARGET_READER_EFFECT_VALUES)).min(1).readonly(),
    sceneIds: z.array(StableIdSchema).min(1).readonly(),
    summary: NonEmptyStringSchema,
  })
  .readonly();

export const ChapterOutlineSchema = z
  .object({
    id: StableIdSchema,
    chapterNumber: PositiveIntegerSchema,
    volumeId: StableIdSchema,
    chapterType: z.enum(CHAPTER_TYPE_VALUES),
    chapterTypeTags: z.array(z.enum(CHAPTER_TYPE_VALUES)).max(2).readonly(),
    status: z.enum(CANONICAL_ARTIFACT_STATUS_VALUES),
    displayTitle: NonEmptyStringSchema.optional(),
    targetWordCount: PositiveIntegerSchema,
    activeClueIds: z.array(StableIdSchema).readonly().optional(),
    resolveClueIds: z.array(StableIdSchema).readonly().optional(),
    introduceClueIds: z.array(StableIdSchema).readonly().optional(),
    sceneSkeleton: z.array(SceneSkeletonSchema).min(1).readonly(),
    emotionCurveStageIds: z.array(StableIdSchema).min(4).max(6).readonly(),
    emotionCurve: z.array(EmotionCurveStageSchema).min(4).max(6).readonly().optional(),
  })
  .readonly();

export const ChapterManuscriptSchema = z
  .object({
    id: StableIdSchema,
    chapterNumber: PositiveIntegerSchema,
    volumeId: StableIdSchema,
    basedOnOutlineId: StableIdSchema,
    status: z.enum(CANONICAL_ARTIFACT_STATUS_VALUES),
    displayTitle: NonEmptyStringSchema.optional(),
    basedOnCanonicalVersion: StableIdSchema,
    sceneAnchorIds: z.array(StableIdSchema).min(1).readonly(),
  })
  .readonly();

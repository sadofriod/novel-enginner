import { z } from 'zod';

import {
  BELIEF_STATE_VALUES,
  ENTITY_STATUS_VALUES,
  PLANNING_ANCHOR_KIND_VALUES,
  PLANNING_ANCHOR_STATUS_VALUES,
  PLOT_CLUE_STATUS_VALUES,
} from '../values';

import { ConfidenceSchema, NonEmptyStringSchema, PositiveIntegerSchema, StableIdSchema } from './common';

export const FactSchema = z
  .object({
    id: StableIdSchema,
    statement: NonEmptyStringSchema,
    sourceRef: StableIdSchema,
    visibility: NonEmptyStringSchema,
    status: z.enum(ENTITY_STATUS_VALUES),
  })
  .readonly();

export const BeliefRecordSchema = z
  .object({
    factId: StableIdSchema,
    beliefState: z.enum(BELIEF_STATE_VALUES),
    sourceRef: StableIdSchema,
    chapterAcquired: PositiveIntegerSchema,
    visibility: NonEmptyStringSchema,
    confidence: ConfidenceSchema,
  })
  .readonly();

export const CharacterSchema = z
  .object({
    id: StableIdSchema,
    name: NonEmptyStringSchema,
    status: z.enum(ENTITY_STATUS_VALUES),
    coreMotivation: NonEmptyStringSchema,
    worldview: NonEmptyStringSchema,
    baselinePersonality: NonEmptyStringSchema.optional(),
    hardConstraints: z.array(NonEmptyStringSchema).readonly().optional(),
    knowledgeLedger: z.array(BeliefRecordSchema).readonly().optional(),
    relationshipIds: z.array(StableIdSchema).readonly().optional(),
    resourceIds: z.array(StableIdSchema).readonly().optional(),
    goalState: NonEmptyStringSchema.optional(),
    injuryState: NonEmptyStringSchema.optional(),
    techLevel: NonEmptyStringSchema,
  })
  .readonly();

export const PlanningAnchorSchema = z
  .object({
    id: StableIdSchema,
    kind: z.enum(PLANNING_ANCHOR_KIND_VALUES),
    title: NonEmptyStringSchema,
    status: z.enum(PLANNING_ANCHOR_STATUS_VALUES),
    ownerRef: StableIdSchema,
    summary: NonEmptyStringSchema,
    relatedClueIds: z.array(StableIdSchema).readonly(),
    targetChapterIds: z.array(StableIdSchema).readonly(),
  })
  .readonly();

export const RelationshipSchema = z
  .object({
    id: StableIdSchema,
    sourceRef: StableIdSchema,
    targetRef: StableIdSchema,
    relationType: NonEmptyStringSchema,
    status: z.enum(ENTITY_STATUS_VALUES),
  })
  .readonly();

export const ResourceSchema = z
  .object({
    id: StableIdSchema,
    name: NonEmptyStringSchema,
    resourceType: NonEmptyStringSchema,
    ownerRef: StableIdSchema,
    holderRef: StableIdSchema,
    status: z.enum(ENTITY_STATUS_VALUES),
  })
  .readonly();

export const FactionSchema = z
  .object({
    id: StableIdSchema,
    name: NonEmptyStringSchema,
    type: NonEmptyStringSchema,
    goal: NonEmptyStringSchema,
    resourceIds: z.array(StableIdSchema).readonly(),
    relationshipIds: z.array(StableIdSchema).readonly(),
    knownByCharacters: z.array(StableIdSchema).readonly(),
    status: z.enum(ENTITY_STATUS_VALUES),
  })
  .readonly();

export const LocationSchema = z
  .object({
    id: StableIdSchema,
    name: NonEmptyStringSchema,
    type: NonEmptyStringSchema,
    parentLocation: StableIdSchema.optional(),
    controlFaction: StableIdSchema.optional(),
    hazards: z.array(NonEmptyStringSchema).readonly(),
    accessRules: z.array(NonEmptyStringSchema).readonly(),
    status: z.enum(ENTITY_STATUS_VALUES),
  })
  .readonly();

export const TechRuleSchema = z
  .object({
    id: StableIdSchema,
    name: NonEmptyStringSchema,
    tier: NonEmptyStringSchema,
    preconditions: z.array(NonEmptyStringSchema).readonly(),
    costs: z.array(NonEmptyStringSchema).readonly(),
    limits: z.array(NonEmptyStringSchema).readonly(),
    allowedEffects: z.array(NonEmptyStringSchema).readonly(),
    status: z.enum(ENTITY_STATUS_VALUES),
  })
  .readonly();

export const PlotClueSchema = z
  .object({
    id: StableIdSchema,
    title: NonEmptyStringSchema,
    introducedInChapter: PositiveIntegerSchema,
    currentStatus: z.enum(PLOT_CLUE_STATUS_VALUES),
    resolveTargetVolume: StableIdSchema,
    readerVisibility: NonEmptyStringSchema,
    knownByCharacterIds: z.array(StableIdSchema).readonly(),
    misledCharacterIds: z.array(StableIdSchema).readonly(),
    dependencyClueIds: z.array(StableIdSchema).readonly(),
    conflictClueIds: z.array(StableIdSchema).readonly(),
  })
  .readonly();

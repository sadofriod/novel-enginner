import { z } from 'zod';

import {
  APPROVAL_MODE_VALUES,
  BELIEF_STATE_VALUES,
  BOOK_STATUS_VALUES,
  CANONICAL_ARTIFACT_STATUS_VALUES,
  CAPABILITY_REGISTRATION_STATUS_VALUES,
  CHAPTER_TYPE_VALUES,
  COMMAND_INTENT_VALUES,
  EMOTION_CURVE_STAGE_TYPE_VALUES,
  ENTITY_STATUS_VALUES,
  MANUAL_RISK_VALUES,
  PLOT_CLUE_STATUS_VALUES,
  PLANNING_ANCHOR_KIND_VALUES,
  PLANNING_ANCHOR_STATUS_VALUES,
  PROPOSAL_ARTIFACT_TYPE_VALUES,
  PROPOSAL_STATUS_VALUES,
  REVIEW_FRESHNESS_VALUES,
  REVIEW_HARD_FAILURE_VALUES,
  SYSTEM_TASK_TYPE_VALUES,
  TARGET_READER_EFFECT_VALUES,
  VOLUME_STATUS_VALUES,
  WORKSPACE_VALIDITY_VALUES,
} from './values';

const StableIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const NonEmptyStringSchema = z.string().trim().min(1);
const PositiveIntegerSchema = z.number().int().positive();
const ScoreSchema = z.number().int().min(0).max(100);
const ConfidenceSchema = z.number().min(0).max(1);

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

export const BookSchema = z
  .object({
    id: StableIdSchema,
    title: NonEmptyStringSchema,
    status: z.enum(BOOK_STATUS_VALUES),
    activeVolumeId: StableIdSchema,
    latestCanonicalVersion: StableIdSchema,
    globalPromises: z.array(StableIdSchema).readonly(),
    globalConstraints: z.array(StableIdSchema).readonly(),
    defaultChapterTypePolicy: DefaultChapterTypePolicySchema,
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

export const CharacterSchema = z
  .object({
    id: StableIdSchema,
    name: NonEmptyStringSchema,
    status: z.enum(ENTITY_STATUS_VALUES),
    coreMotivation: NonEmptyStringSchema,
    worldview: NonEmptyStringSchema,
    baselinePersonality: NonEmptyStringSchema.optional(),
    hardConstraints: z.array(NonEmptyStringSchema).readonly().optional(),
    knownFacts: z.array(BeliefRecordSchema).readonly().optional(),
    knowledgeLedger: z.array(BeliefRecordSchema).readonly().optional(),
    knownFactIds: z.array(StableIdSchema).readonly().optional(),
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

export const ProposalSchema = z
  .object({
    proposalId: StableIdSchema,
    artifactType: z.enum(PROPOSAL_ARTIFACT_TYPE_VALUES),
    targetId: StableIdSchema,
    status: z.enum(PROPOSAL_STATUS_VALUES),
    intent: z.enum(COMMAND_INTENT_VALUES),
    basedOnCanonicalVersion: StableIdSchema,
    entityVersionRefs: z.array(EntityVersionRefSchema).readonly().optional(),
    parentRunId: StableIdSchema,
    supersedesProposalId: StableIdSchema.optional(),
    latestReviewResultId: StableIdSchema.optional(),
    overrideAuditId: StableIdSchema.optional(),
    bundledDiffRefs: z.array(StableIdSchema).readonly().optional(),
  })
  .readonly();

export const BudgetOverrideSchema = z
  .object({
    targetWordCount: PositiveIntegerSchema.optional(),
  })
  .readonly();

export const CommandEnvelopeSchema = z
  .object({
    workspaceId: StableIdSchema,
    bookId: StableIdSchema,
    artifactType: z.enum(PROPOSAL_ARTIFACT_TYPE_VALUES).optional(),
    systemTaskType: z.enum(SYSTEM_TASK_TYPE_VALUES).optional(),
    targetId: StableIdSchema.optional(),
    intent: z.enum(COMMAND_INTENT_VALUES),
    requestedBy: StableIdSchema,
    approvalMode: z.enum(APPROVAL_MODE_VALUES),
    budgetOverride: BudgetOverrideSchema.optional(),
    idempotencyKey: StableIdSchema,
  })
  .readonly();

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

export const CapabilityRegistrationStateSchema = z
  .object({
    status: z.enum(CAPABILITY_REGISTRATION_STATUS_VALUES),
    capabilityId: StableIdSchema.optional(),
    source: NonEmptyStringSchema.optional(),
    details: NonEmptyStringSchema.optional(),
  })
  .readonly();

export type StableId = z.infer<typeof StableIdSchema>;
export type EntityVersionRef = z.infer<typeof EntityVersionRefSchema>;
export type DefaultChapterTypePolicy = z.infer<typeof DefaultChapterTypePolicySchema>;
export type Fact = z.infer<typeof FactSchema>;
export type BeliefRecord = z.infer<typeof BeliefRecordSchema>;
export type Book = z.infer<typeof BookSchema>;
export type Volume = z.infer<typeof VolumeSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type PlanningAnchor = z.infer<typeof PlanningAnchorSchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
export type Faction = z.infer<typeof FactionSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type TechRule = z.infer<typeof TechRuleSchema>;
export type PlotClue = z.infer<typeof PlotClueSchema>;
export type SceneParticipantState = z.infer<typeof SceneParticipantStateSchema>;
export type SceneStateSlice = z.infer<typeof SceneStateSliceSchema>;
export type SceneSkeleton = z.infer<typeof SceneSkeletonSchema>;
export type EmotionCurveStage = z.infer<typeof EmotionCurveStageSchema>;
export type ChapterOutline = z.infer<typeof ChapterOutlineSchema>;
export type ChapterManuscript = z.infer<typeof ChapterManuscriptSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type BudgetOverride = z.infer<typeof BudgetOverrideSchema>;
export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
export type ReviewHardFailure = z.infer<typeof ReviewHardFailureSchema>;
export type DimensionScores = z.infer<typeof DimensionScoresSchema>;
export type ReviewerResult = z.infer<typeof ReviewerResultSchema>;
export type OverrideAudit = z.infer<typeof OverrideAuditSchema>;
export type ReviewFreshnessState = z.infer<typeof ReviewFreshnessStateSchema>;
export type ManualRiskState = z.infer<typeof ManualRiskStateSchema>;
export type WorkspaceValidityState = z.infer<typeof WorkspaceValidityStateSchema>;
export type CapabilityRegistrationState = z.infer<typeof CapabilityRegistrationStateSchema>;
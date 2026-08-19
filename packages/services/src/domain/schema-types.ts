import type { z } from 'zod';

import type {
  BeliefRecordSchema,
  BookSchema,
  BudgetOverrideSchema,
  CharacterSchema,
  ChapterManuscriptSchema,
  ChapterOutlineSchema,
  CommandEnvelopeSchema,
  DefaultChapterTypePolicySchema,
  DimensionScoresSchema,
  EmotionCurveStageSchema,
  EntityVersionRefSchema,
  FactSchema,
  FactionSchema,
  LocationSchema,
  ManualRiskStateSchema,
  OverrideAuditSchema,
  PlanningAnchorSchema,
  PlotClueSchema,
  ProposalReviewSchema,
  ProposalSchema,
  ProjectBriefSchema,
  RelationshipSchema,
  ResourceSchema,
  ReviewCommentDraftSchema,
  ReviewCommentSchema,
  ReviewFreshnessStateSchema,
  ReviewHardFailureSchema,
  ReviewerResultSchema,
  ReviewThreadSchema,
  SceneParticipantStateSchema,
  SceneSkeletonSchema,
  SceneStateSliceSchema,
  StoryBlueprintSchema,
  SubmitReviewInputSchema,
  TechRuleSchema,
  VolumeSchema,
  WorldFoundationSchema,
  WorkspaceValidityStateSchema,
  NewReviewThreadSchema,
} from './schema';

export type StableId = string;
export type EntityVersionRef = z.infer<typeof EntityVersionRefSchema>;
export type DefaultChapterTypePolicy = z.infer<typeof DefaultChapterTypePolicySchema>;
export type Fact = z.infer<typeof FactSchema>;
export type BeliefRecord = z.infer<typeof BeliefRecordSchema>;
export type Book = z.infer<typeof BookSchema>;
export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;
export type WorldFoundation = z.infer<typeof WorldFoundationSchema>;
export type StoryBlueprint = z.infer<typeof StoryBlueprintSchema>;
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
export type ReviewThread = z.infer<typeof ReviewThreadSchema>;
export type ReviewComment = z.infer<typeof ReviewCommentSchema>;
export type NewReviewThread = z.infer<typeof NewReviewThreadSchema>;
export type ReviewCommentDraft = z.infer<typeof ReviewCommentDraftSchema>;
export type ProposalReview = z.infer<typeof ProposalReviewSchema>;
export type SubmitReviewInput = z.infer<typeof SubmitReviewInputSchema>;

export const BOOK_STATUS_VALUES = [
  'planning',
  'active',
  'paused',
  'completed',
  'archived',
] as const;

export type BookStatus = (typeof BOOK_STATUS_VALUES)[number];

export const VOLUME_STATUS_VALUES = [
  'planning',
  'active',
  'paused',
  'completed',
  'archived',
] as const;

export type VolumeStatus = (typeof VOLUME_STATUS_VALUES)[number];

export const ENTITY_STATUS_VALUES = ['active', 'inactive', 'archived'] as const;

export type EntityStatus = (typeof ENTITY_STATUS_VALUES)[number];

export const CANONICAL_ARTIFACT_STATUS_VALUES = [
  'draft',
  'approved',
  'superseded',
  'archived',
] as const;

export type CanonicalArtifactStatus = (typeof CANONICAL_ARTIFACT_STATUS_VALUES)[number];

export const PROPOSAL_STATUS_VALUES = [
  'pending-review',
  'pending-approval',
  'approved',
  'rejected',
  'override-approved',
  'review-blocked',
  'superseded',
  'commit-blocked',
  'waiting-sync',
  'exported',
  'deleted',
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUS_VALUES)[number];

export const PLANNING_ANCHOR_KIND_VALUES = ['promise', 'constraint', 'milestone'] as const;

export type PlanningAnchorKind = (typeof PLANNING_ANCHOR_KIND_VALUES)[number];

export const PLANNING_ANCHOR_STATUS_VALUES = ['active', 'satisfied', 'superseded', 'archived'] as const;

export type PlanningAnchorStatus = (typeof PLANNING_ANCHOR_STATUS_VALUES)[number];

export const REVIEW_FRESHNESS_VALUES = ['fresh', 'stale'] as const;

export type ReviewFreshness = (typeof REVIEW_FRESHNESS_VALUES)[number];

export const MANUAL_RISK_VALUES = ['none', 'low', 'medium', 'high'] as const;

export type ManualRisk = (typeof MANUAL_RISK_VALUES)[number];

export const WORKSPACE_VALIDITY_VALUES = ['clean', 'dirty', 'invalid'] as const;

export type WorkspaceValidity = (typeof WORKSPACE_VALIDITY_VALUES)[number];

export const CAPABILITY_REGISTRATION_STATUS_VALUES = ['registered', 'discovered-unregistered', 'missing-source'] as const;

export type CapabilityRegistrationStatus = (typeof CAPABILITY_REGISTRATION_STATUS_VALUES)[number];

export const CAPABILITY_KIND_VALUES = ['agent', 'skill', 'mcp', 'prompt-pack'] as const;

export type CapabilityKind = (typeof CAPABILITY_KIND_VALUES)[number];

export const PROPOSAL_ARTIFACT_TYPE_VALUES = [
  'project-brief',
  'world-foundation',
  'story-blueprint',
  'world-change',
  'volume-outline',
  'chapter-outline',
  'chapter-manuscript',
  'character-update',
  'faction-update',
  'location-update',
  'tech-rule-update',
  'fact-update',
  'relationship-update',
  'resource-update',
] as const;

export type ProposalArtifactType = (typeof PROPOSAL_ARTIFACT_TYPE_VALUES)[number];

export const SYSTEM_TASK_TYPE_VALUES = [
  'rebuild-graph',
  're-sync-state',
  'create-bootstrap-session',
  'continue-bootstrap-session',
  'submit-dialogue-round',
  'submit-market-research',
  'scan-import-directory',
  'confirm-import',
  'discard-bootstrap-session',
] as const;

export type SystemTaskType = (typeof SYSTEM_TASK_TYPE_VALUES)[number];

export const COMMAND_INTENT_VALUES = [
  'propose',
  'regenerate',
  'approve',
  'reject',
  'override-approve',
  'export-draft',
  'rebuild-graph',
  're-sync-state',
  'create-bootstrap-session',
  'continue-bootstrap-session',
  'submit-dialogue-round',
  'submit-market-research',
  'scan-import-directory',
  'confirm-import',
  'discard-bootstrap-session',
  'retry-step',
  'resume-run',
  'abort-run',
  'mark-external-failure',
] as const;

export type CommandIntent = (typeof COMMAND_INTENT_VALUES)[number];

export const APPROVAL_MODE_VALUES = ['manual'] as const;

export type ApprovalMode = (typeof APPROVAL_MODE_VALUES)[number];

export const CHAPTER_TYPE_VALUES = [
  'progress',
  'pressure',
  'action',
  'reveal',
  'payoff',
  'turn',
  'transition',
] as const;

export type ChapterType = (typeof CHAPTER_TYPE_VALUES)[number];

export const EMOTION_CURVE_STAGE_TYPE_VALUES = [
  'rise',
  'pressure',
  'counter',
  'reveal-or-turn',
  'hook',
] as const;

export type EmotionCurveStageType = (typeof EMOTION_CURVE_STAGE_TYPE_VALUES)[number];

export const TARGET_READER_EFFECT_VALUES = [
  'pressure',
  'confusion',
  'anticipation',
  'shock',
  'payoff',
  'unease',
  'fear',
  'pity',
  'ignite',
] as const;

export type TargetReaderEffect = (typeof TARGET_READER_EFFECT_VALUES)[number];

export const BELIEF_STATE_VALUES = ['known', 'suspected', 'misunderstood'] as const;

export type BeliefState = (typeof BELIEF_STATE_VALUES)[number];

export const PLOT_CLUE_STATUS_VALUES = [
  'candidate',
  'introduced',
  'active',
  'escalated',
  'suppressed',
  'resolved',
  'invalidated',
] as const;

export type PlotClueStatus = (typeof PLOT_CLUE_STATUS_VALUES)[number];

export const REVIEW_HARD_FAILURE_VALUES = [
  'banned-terms-hit',
  'paragraph-length-violation',
  'exposition-overload',
  'motivation-drift',
  'tech-tree-violation',
  'clue-payoff-conflict',
  'outline-structure-drift',
  'missing-ending-hook',
  'weak-payoff-release',
  'missing-pressure-beat',
  'missing-intensity-rise',
  'midpoint-pacing-collapse',
] as const;

export type ReviewHardFailureCode = (typeof REVIEW_HARD_FAILURE_VALUES)[number];
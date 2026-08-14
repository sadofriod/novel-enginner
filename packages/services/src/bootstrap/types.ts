/**
 * Core types and contracts for the bootstrap onboarding flow.
 * Per doc 11.3 (new book path) and 11.4 (import path).
 */

/**
 * Session lifecycle status (11.6)
 */
export const BOOTSTRAP_STATUS_VALUES = [
  'drafting',
  'awaiting-approval',
  'advancing',
  'import-review',
  'ready-to-write',
  'completed',
  'abandoned',
  'failed',
] as const;

export type BootstrapStatus = typeof BOOTSTRAP_STATUS_VALUES[number];

/**
 * New book path stages (11.3)
 */
export const NEW_BOOK_STAGE_VALUES = [
  'market-research',
  'inspiration-dialogue',
  'project-brief',
  'world-foundation',
  'story-blueprint',
  'volume-outlines',
  'chapter-outline-batch',
] as const;

export type NewBookStage = typeof NEW_BOOK_STAGE_VALUES[number];

/**
 * Import path stages (11.4)
 */
export const IMPORT_STAGE_VALUES = [
  'import-scan',
  'import-mapping',
  'import-confirmation',
  'import-health-report',
] as const;

export type ImportStage = typeof IMPORT_STAGE_VALUES[number];

export const BOOTSTRAP_STAGE_VALUES = [...NEW_BOOK_STAGE_VALUES, ...IMPORT_STAGE_VALUES] as const;
export type BootstrapStage = typeof BOOTSTRAP_STAGE_VALUES[number];

/**
 * Session path (new book or import)
 */
export const BOOTSTRAP_PATH_VALUES = ['new-book', 'import'] as const;
export type BootstrapPath = typeof BOOTSTRAP_PATH_VALUES[number];

/**
 * License scope for evidence documents (11.6)
 */
export const LICENSE_SCOPE_VALUES = [
  'permissive',
  'attribution-required',
  'restricted',
  'copyrighted',
] as const;

export type LicenseScope = typeof LICENSE_SCOPE_VALUES[number];

/**
 * BootstrapSession represents one recoverable onboarding session.
 */
export interface BootstrapSessionData {
  sessionId: string;
  workspaceId: string;
  bookId?: string; // Only set after first canonical commit
  status: BootstrapStatus;
  stage: BootstrapStage;
  path: BootstrapPath;
  currentRevisionId?: string;
  completedAt?: Date;
  abandonedAt?: Date;
  failedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * BootstrapRevision is an immutable snapshot of state at a stage.
 */
export interface BootstrapRevisionData {
  revisionId: string;
  sessionId: string;
  stage: BootstrapStage;
  authorInput?: unknown; // author's raw input for this round
  structuredDraft?: unknown; // parsed/structured version per stage
  importMapping?: unknown; // for import stages: file → artifact kind mapping
  diagnostics?: unknown; // validation errors/warnings
  createdAt: Date;
  expiresAt: Date; // 30 days from creation
}

/**
 * BootstrapEvidence represents a single evidence URL for market research.
 * Per 11.3: "趋势简报只能保留抽象趋势、读者偏好、竞争密度和来源证据"
 */
export interface BootstrapEvidenceData {
  evidenceId: string;
  revisionId: string;
  url: string;
  title: string;
  collectedAt: Date;
  cleanedSummary: string | undefined; // sanitized excerpt free of copyrighted content
  licenseScope: LicenseScope;
  createdAt: Date;
}

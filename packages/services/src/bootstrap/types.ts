export const BOOTSTRAP_PATH_VALUES = ['new-book', 'import'] as const;
export type BootstrapPath = (typeof BOOTSTRAP_PATH_VALUES)[number];

export const BOOTSTRAP_SESSION_STATUS_VALUES = [
  'drafting',
  'awaiting-approval',
  'advancing',
  'import-review',
  'ready-to-write',
  'completed',
  'abandoned',
  'failed',
] as const;
export const BOOTSTRAP_STATUS_VALUES = BOOTSTRAP_SESSION_STATUS_VALUES;
export type BootstrapSessionStatus = (typeof BOOTSTRAP_SESSION_STATUS_VALUES)[number];

export const NEW_BOOK_STAGE_VALUES = [
  'market-research',
  'inspiration-dialogue',
  'project-brief',
  'world-foundation',
  'story-blueprint',
  'volume-outlines',
  'chapter-outline-batch',
] as const;
export type NewBookStage = (typeof NEW_BOOK_STAGE_VALUES)[number];

export const IMPORT_STAGE_VALUES = [
  'import-scan',
  'import-mapping',
  'import-confirmation',
  'import-health-report',
] as const;
export type ImportStage = (typeof IMPORT_STAGE_VALUES)[number];

export const BOOTSTRAP_STAGE_VALUES = [...NEW_BOOK_STAGE_VALUES, ...IMPORT_STAGE_VALUES] as const;
export type BootstrapStage = NewBookStage | ImportStage;

export const LICENSE_SCOPE_VALUES = ['permissive', 'attribution-required', 'restricted', 'copyrighted'] as const;

export interface BootstrapSession {
  readonly id: string;
  readonly workspaceId: string;
  readonly bookId: string;
  readonly path: BootstrapPath;
  readonly status: BootstrapSessionStatus;
  readonly currentStage: BootstrapStage;
  readonly currentRevisionId?: string | undefined;
  readonly bookName?: string | undefined;
  readonly sessionType?: string | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string | undefined;
  readonly abandonedAt?: string | undefined;
  readonly failedAt?: string | undefined;
  readonly expiresAt?: string | undefined;
}

export interface BootstrapRevision {
  readonly id: string;
  readonly sessionId: string;
  readonly stage: BootstrapStage;
  readonly createdAt: string;
  readonly summary?: string | undefined;
  readonly draft?: Record<string, unknown> | undefined;
  readonly mapping?: Record<string, unknown> | undefined;
  readonly diagnostics?: ReadonlyArray<string> | undefined;
  readonly evidenceIds?: ReadonlyArray<string> | undefined;
}

export interface BootstrapEvidence {
  readonly id: string;
  readonly sessionId: string;
  readonly revisionId?: string;
  readonly url: string;
  readonly title: string;
  readonly collectedAt: string;
  readonly cleanedSummary: string | undefined;
  readonly license: 'public-domain' | 'cc-by' | 'cc-by-sa' | 'fair-use' | 'unknown';
  readonly copyrightBoundary: 'allowed' | 'review-required' | 'blocked';
  readonly status: 'draft' | 'approved' | 'rejected';
}

export interface BootstrapDecision {
  readonly title: string;
  readonly value: string;
  readonly notes?: string | undefined;
}

export interface BootstrapTrendReport {
  readonly summary: string;
  readonly evidenceIds: ReadonlyArray<string>;
  readonly sources: ReadonlyArray<string>;
}

export interface BootstrapImportFileEntry {
  readonly sourcePath: string;
  readonly detectedKind: 'project-brief' | 'world-foundation' | 'story-blueprint' | 'volume' | 'chapter' | 'reference';
  readonly canonicalTarget?: string | undefined;
  readonly confidence: number;
  readonly notes?: string | undefined;
}

export interface BootstrapHealthIssue {
  readonly code: string;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly fixHint?: string | undefined;
}

export interface BootstrapHealthReport {
  readonly ready: boolean;
  readonly issues: ReadonlyArray<BootstrapHealthIssue>;
  readonly missingArtifacts: ReadonlyArray<string>;
  readonly prioritySequence: ReadonlyArray<string>;
}

import type { CommandEnvelope, Proposal, ReviewerResult } from '../../domain';
import type { WorkspaceValidity } from '../../domain/values';
import type { BootstrapRevision, BootstrapSession } from '../../bootstrap/types';
import type { SyntheticCommit } from '../../workspace/session';
import type { RunSnapshotRef } from '../../workflow/run-drift';
import type { SearchWorkspace } from '../search-contract';
import type { CanonicalDraft, CommandRecord, RunRecord } from '../store';

export interface CreateApiServerOptions {
  readonly store?: import('../store').RuntimeStore;
  readonly eventBus?: import('../event-bus').RunEventBus;
  readonly workspaceRoot?: string;
  readonly getWorkspaceValidity?: (workspaceId: string) => WorkspaceValidity;
  readonly persistAcceptedCommand?: (envelope: CommandEnvelope, command: CommandRecord, run: RunRecord) => Promise<void>;
  readonly loadPersistedCommand?: (workspaceId: string, idempotencyKey: string) => Promise<{ readonly command: CommandRecord; readonly run?: RunRecord } | undefined>;
  readonly loadActiveProposal?: (workspaceId: string, bookId: string, artifactType: Proposal['artifactType'], targetId: string) => Promise<Proposal | undefined>;
  readonly persistProposalDecision?: (workspaceId: string, bookId: string, proposal: Proposal) => Promise<void>;
  readonly persistOverrideAudit?: (overrideAuditId: string, proposalId: string, audit: import('../../domain').OverrideAudit) => Promise<void>;
  readonly loadCanonicalDraft?: (proposalId: string) => Promise<CanonicalDraft | undefined>;
  readonly loadReviewerResult?: (reviewResultId: string) => Promise<ReviewerResult | undefined>;
  readonly onRebuildGraph?: (workspaceId: string, bookId: string, snapshot: import('../../workspace/sync-engine').WorkspaceSnapshot) => Promise<unknown>;
  readonly dispatchCommand?: (envelope: CommandEnvelope, run: RunRecord, canonicalVersion?: string) => Promise<void>;
  readonly dispatchSyntheticReview?: (input: {
    readonly workspaceId: string;
    readonly bookId: string;
    readonly artifactType: string;
    readonly targetId: string;
    readonly editedFilePath: string;
    readonly editedText?: string;
    readonly proposalId?: string;
  }) => Promise<void>;
  readonly persistBootstrapState?: (session: BootstrapSession, revision?: BootstrapRevision) => Promise<void>;
  readonly marketResearchPort?: import('../../bootstrap/research/market-research-port').MarketResearchPort;
  readonly readCanonicalFiles?: (workspaceRoot: string) => Promise<readonly import('../../workspace/sync-engine').WorkspaceFileInput[]>;
  readonly searchWorkspace?: SearchWorkspace;
  readonly reSyncStateOptions?: {
    readonly getActiveRuns: () => readonly RunSnapshotRef[];
    readonly onRunsAborted?: (runIds: readonly string[]) => void;
    readonly onSyntheticCommit?: (commit: SyntheticCommit) => void;
  };
}
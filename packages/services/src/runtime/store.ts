import type { CommandIntent, ProposalArtifactType, SystemTaskType } from '../domain/values';
import type { Proposal } from '../domain';
import type { StableId } from '../domain/schema';
import { WorkspaceSyncSession } from '../workspace/session';
import type { RunSnapshotRef } from '../workflow/run-drift';
import type { ArtifactDetailState } from './artifact-detail';
import type { DerivedGraph } from '../graph/types';
import type { BootstrapEvidence, BootstrapRevision, BootstrapSession } from '../bootstrap/types';

export interface ArtifactSummary extends ArtifactDetailState {
  readonly artifactType: ProposalArtifactType;
  readonly targetId: StableId;
  readonly canonicalStatus?: string;
  readonly activeProposalId?: string;
  readonly proposalStatus?: string;
  /**
   * When true, the artifact was hand-edited after its last approved review, making the
   * stored review stale (docs/architecture/modules/05-reviewer-and-quality-gates.md §5.8).
   * A synthetic review is queued automatically; downstream auto-pipeline is blocked until
   * the re-assessment passes.
   */
  readonly reviewStale?: boolean;
  /**
   * When true, a synthetic re-review found a non-exemptible failure on hand-edited
   * canonical content (§5.8). The artifact stays canonical (no rollback), but downstream
   * auto flows are blocked until a fresh review passes.
   */
  readonly reviewBlocked?: boolean;
  /** ISO timestamp of the last known update, used to order the Web console queue. */
  readonly updatedAt?: string;
}

export interface RunRecord {
  readonly runId: string;
  readonly commandId: string;
  readonly workspaceId: StableId;
  readonly bookId: StableId;
  readonly artifactType?: ProposalArtifactType;
  readonly systemTaskType?: SystemTaskType;
  readonly targetId?: StableId;
  readonly intent?: CommandIntent;
  readonly basedOnCanonicalVersion?: StableId;
  status: string;
  nextExpectedState: string;
  readonly createdAt: string;
  updatedAt: string;
}

export interface CommandRecord {
  readonly commandId: string;
  readonly runId: string;
  readonly idempotencyKey: string;
  status: string;
  readonly acceptedAt: string;
}

export interface CanonicalDraft {
  readonly proposalId: StableId;
  readonly relativePath: string;
  readonly content: string;
}

/**
 * Process-local storage for commands/runs/artifacts. This backs the minimal HTTP/SSE
 * control surface described in docs/architecture/modules/07-api-events-and-runtime.md
 * for v1; a real deployment would replace this with the Postgres-backed persistence
 * from Phase 4 without changing the public shapes below.
 */
export class RuntimeStore {
  private readonly commandsById = new Map<string, CommandRecord>();
  private readonly commandIdByIdempotencyKey = new Map<string, string>();
  private readonly runsById = new Map<string, RunRecord>();
  private readonly artifactsByKey = new Map<string, ArtifactSummary>();
  private readonly proposalsByKey = new Map<string, Proposal>();
  private readonly lastKnownSnapshotByWorkspaceId = new Map<
    string,
    import('../workspace/sync-engine').WorkspaceSnapshot
  >();
  private readonly syncSessionByWorkspaceId = new Map<string, WorkspaceSyncSession>();
  private readonly workspaceValidityById = new Map<string, import('../domain/values').WorkspaceValidity>();
  private readonly canonicalDraftByProposalId = new Map<string, CanonicalDraft>();
  private readonly pendingInternalCanonicalContentByPath = new Map<string, string>();
  private readonly bootstrapSessionsById = new Map<string, BootstrapSession>();
  private readonly bootstrapRevisionsById = new Map<string, BootstrapRevision>();
  private readonly bootstrapEvidenceById = new Map<string, BootstrapEvidence>();

  findCommandByIdempotencyKey(idempotencyKey: string): CommandRecord | undefined {
    const commandId = this.commandIdByIdempotencyKey.get(idempotencyKey);
    return commandId === undefined ? undefined : this.commandsById.get(commandId);
  }

  saveCommand(record: CommandRecord): void {
    this.commandsById.set(record.commandId, record);
    this.commandIdByIdempotencyKey.set(record.idempotencyKey, record.commandId);
  }

  getCommand(commandId: string): CommandRecord | undefined {
    return this.commandsById.get(commandId);
  }

  saveRun(record: RunRecord): void {
    this.runsById.set(record.runId, record);
  }

  updateRunStatus(runId: string, status: string, nextExpectedState: string): RunRecord | undefined {
    const run = this.runsById.get(runId);
    if (run === undefined) {
      return undefined;
    }
    const updated = { ...run, status, nextExpectedState, updatedAt: new Date().toISOString() };
    this.runsById.set(runId, updated);
    return updated;
  }

  getRun(runId: string): RunRecord | undefined {
    return this.runsById.get(runId);
  }

  upsertArtifact(summary: ArtifactSummary): void {
    this.artifactsByKey.set(artifactKey(summary.artifactType, summary.targetId), summary);
  }

  getArtifact(artifactType: string, targetId: string): ArtifactSummary | undefined {
    return this.artifactsByKey.get(artifactKey(artifactType, targetId));
  }

  deleteArtifact(artifactType: string, targetId: string): void {
    this.artifactsByKey.delete(artifactKey(artifactType, targetId));
  }

  saveProposal(proposal: Proposal): void {
    this.proposalsByKey.set(artifactKey(proposal.artifactType, proposal.targetId), proposal);
  }

  getActiveProposal(artifactType: ProposalArtifactType, targetId: string): Proposal | undefined {
    return this.proposalsByKey.get(artifactKey(artifactType, targetId));
  }

  saveCanonicalDraft(draft: CanonicalDraft): void {
    this.canonicalDraftByProposalId.set(draft.proposalId, draft);
  }

  getCanonicalDraft(proposalId: string): CanonicalDraft | undefined {
    return this.canonicalDraftByProposalId.get(proposalId);
  }

  recordInternalCanonicalCommit(relativePath: string, content: string): void {
    this.pendingInternalCanonicalContentByPath.set(relativePath, content);
  }

  consumeInternalCanonicalCommit(relativePath: string, content: string): boolean {
    if (this.pendingInternalCanonicalContentByPath.get(relativePath) !== content) {
      return false;
    }
    this.pendingInternalCanonicalContentByPath.delete(relativePath);
    return true;
  }

  /** Lists every known artifact summary, for the Web console's approval queue. */
  listArtifacts(): readonly ArtifactSummary[] {
    return Array.from(this.artifactsByKey.values());
  }

  upsertBootstrapSession(session: BootstrapSession): void {
    this.bootstrapSessionsById.set(session.id, session);
  }

  getBootstrapSession(sessionId: string): BootstrapSession | undefined {
    return this.bootstrapSessionsById.get(sessionId);
  }

  listBootstrapSessions(): readonly BootstrapSession[] {
    return Array.from(this.bootstrapSessionsById.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  upsertBootstrapRevision(revision: BootstrapRevision): void {
    this.bootstrapRevisionsById.set(revision.id, revision);
  }

  listBootstrapRevisions(sessionId: string): readonly BootstrapRevision[] {
    return Array.from(this.bootstrapRevisionsById.values())
      .filter((revision) => revision.sessionId === sessionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  upsertBootstrapEvidence(evidence: BootstrapEvidence): void {
    this.bootstrapEvidenceById.set(evidence.id, evidence);
  }

  listBootstrapEvidence(sessionId: string): readonly BootstrapEvidence[] {
    return Array.from(this.bootstrapEvidenceById.values())
      .filter((evidence) => evidence.sessionId === sessionId)
      .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
  }

  /** Lists every known run record, newest first, for the Web console's run trace view. */
  listRuns(): readonly RunRecord[] {
    return Array.from(this.runsById.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listActiveWriteRuns(): readonly RunSnapshotRef[] {
    const writeIntents: ReadonlySet<CommandIntent> = new Set(['propose', 'regenerate', 'approve', 'override-approve']);
    return this.listRuns().flatMap((run): readonly RunSnapshotRef[] => {
      if (run.status !== 'running' || run.intent === undefined || run.basedOnCanonicalVersion === undefined || !writeIntents.has(run.intent)) {
        return [];
      }
      return [{
        runId: run.runId,
        status: 'running',
        basedOnCanonicalVersion: run.basedOnCanonicalVersion,
        isWriteRelated: true,
      }];
    });
  }

  /** Returns the last workspace snapshot produced by a `re-sync-state` call. */
  getLastKnownSnapshot(workspaceId: string): import('../workspace/sync-engine').WorkspaceSnapshot | undefined {
    return this.lastKnownSnapshotByWorkspaceId.get(workspaceId);
  }

  /** Stores the latest workspace snapshot after a successful `re-sync-state` pass. */
  setLastKnownSnapshot(workspaceId: string, snapshot: import('../workspace/sync-engine').WorkspaceSnapshot): void {
    this.lastKnownSnapshotByWorkspaceId.set(workspaceId, snapshot);
  }

  /**
   * Returns (or lazily creates) the per-workspace editing session used to aggregate
   * consecutive saves into a single synthetic commit per
   * docs/architecture/modules/02-canonical-workspace.md §2.6.
   */
  getOrCreateSyncSession(workspaceId: string): WorkspaceSyncSession {
    const existing = this.syncSessionByWorkspaceId.get(workspaceId);
    if (existing !== undefined) {
      return existing;
    }
    const session = new WorkspaceSyncSession(this.getLastKnownSnapshot(workspaceId));
    this.syncSessionByWorkspaceId.set(workspaceId, session);
    return session;
  }

  getWorkspaceValidity(workspaceId: string): import('../domain/values').WorkspaceValidity {
    return this.workspaceValidityById.get(workspaceId) ?? 'clean';
  }

  setWorkspaceValidity(workspaceId: string, validity: import('../domain/values').WorkspaceValidity): void {
    this.workspaceValidityById.set(workspaceId, validity);
  }

  setDerivedGraph(graph: DerivedGraph): void {
    const derivedGraph = {
      status: 'ready' as const,
      latestCanonicalVersion: graph.builtFromSnapshotId,
      graphSnapshotVersion: `graph-${graph.builtFromSnapshotId}`,
      nodes: graph.nodes.map((node) => ({ id: node.id, label: node.label, type: node.kind })),
      edges: graph.edges.map((edge) => ({ source: edge.sourceId, target: edge.targetId, type: edge.type })),
    };
    for (const artifact of this.artifactsByKey.values()) {
      this.upsertArtifact({ ...artifact, derivedGraph, updatedAt: new Date().toISOString() });
    }
  }
}

function artifactKey(artifactType: string, targetId: string): string {
  return `${artifactType}::${targetId}`;
}

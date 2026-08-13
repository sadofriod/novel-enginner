import type { ProposalArtifactType, SystemTaskType } from '../domain/values';
import type { StableId } from '../domain/schema';

export interface ArtifactSummary {
  readonly artifactType: ProposalArtifactType;
  readonly targetId: StableId;
  readonly canonicalStatus?: string;
  readonly activeProposalId?: string;
  readonly proposalStatus?: string;
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

  getRun(runId: string): RunRecord | undefined {
    return this.runsById.get(runId);
  }

  upsertArtifact(summary: ArtifactSummary): void {
    this.artifactsByKey.set(artifactKey(summary.artifactType, summary.targetId), summary);
  }

  getArtifact(artifactType: string, targetId: string): ArtifactSummary | undefined {
    return this.artifactsByKey.get(artifactKey(artifactType, targetId));
  }

  /** Lists every known artifact summary, for the Web console's approval queue. */
  listArtifacts(): readonly ArtifactSummary[] {
    return Array.from(this.artifactsByKey.values());
  }

  /** Lists every known run record, newest first, for the Web console's run trace view. */
  listRuns(): readonly RunRecord[] {
    return Array.from(this.runsById.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function artifactKey(artifactType: string, targetId: string): string {
  return `${artifactType}::${targetId}`;
}

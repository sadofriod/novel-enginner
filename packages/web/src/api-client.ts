/* eslint-disable complexity */

import type { ArtifactSummary, RunRecord } from '@novel-enginner/services/runtime/store';
import type { CommandRecord } from '@novel-enginner/services/runtime/store';
import type { CommandResult } from '@novel-enginner/services/runtime/command-handler';
import type { BootstrapEvidence, BootstrapRevision, BootstrapSession } from '@novel-enginner/services/bootstrap/types';
import type { OverrideAudit } from '@novel-enginner/services/domain/schema';

type FetchImplementation = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => ReturnType<typeof fetch>;

/**
 * Thin `fetch`-based client for the local control surface described in
 * docs/architecture/modules/07-api-events-and-runtime.md §7.5. Kept dependency-free so
 * it can run directly in the SPA bundle without a data-fetching library.
 */
export interface ApiClientOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchImplementation;
}

export interface BootstrapConfig {
  readonly workspaceId: string;
  readonly bookId: string;
  readonly workspaceRoot: string;
}

export interface CommandInput {
  readonly workspaceId: string;
  readonly bookId: string;
  readonly artifactType?: string;
  readonly systemTaskType?: string;
  readonly targetId?: string;
  readonly intent: string;
  readonly requestedBy: string;
  readonly approvalMode: 'manual';
  readonly budgetOverride?: { readonly targetWordCount?: number };
  readonly sessionId?: string;
  readonly path?: 'new-book' | 'import';
  readonly bookName?: string;
  readonly summary?: string;
  readonly draft?: Record<string, unknown>;
  readonly mapping?: Record<string, unknown>;
  readonly diagnostics?: readonly string[];
  readonly sourceRoot?: string;
  readonly targetRoot?: string;
  readonly idempotencyKey: string;
}

export interface SyncCommandInput {
  readonly workspaceId: string;
  readonly bookId: string;
  readonly requestedBy: string;
  readonly approvalMode: 'manual';
  readonly idempotencyKey: string;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImplementation;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? '';
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  async listArtifacts(): Promise<readonly ArtifactSummary[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/artifacts`);
    return (await response.json()) as readonly ArtifactSummary[];
  }

  async getArtifact(artifactType: string, targetId: string): Promise<ArtifactSummary | undefined> {
    const response = await this.fetchImpl(`${this.baseUrl}/artifacts/${artifactType}/${targetId}`);
    if (response.status === 404) {
      return undefined;
    }
    return (await response.json()) as ArtifactSummary;
  }

  async listRuns(): Promise<readonly RunRecord[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/runs`);
    return (await response.json()) as readonly RunRecord[];
  }

  async listBootstrapSessions(): Promise<readonly BootstrapSession[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/bootstrap-sessions`);
    return (await response.json()) as readonly BootstrapSession[];
  }

  async getBootstrapConfig(): Promise<BootstrapConfig> {
    const response = await this.fetchImpl(`${this.baseUrl}/bootstrap-config`);
    return (await response.json()) as BootstrapConfig;
  }

  async getBootstrapSession(sessionId: string): Promise<BootstrapSession | undefined> {
    const response = await this.fetchImpl(`${this.baseUrl}/bootstrap-sessions/${sessionId}`);
    return response.status === 404 ? undefined : await response.json() as BootstrapSession;
  }

  async listBootstrapRevisions(sessionId: string): Promise<readonly BootstrapRevision[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/bootstrap-sessions/${sessionId}/revisions`);
    return (await response.json()) as readonly BootstrapRevision[];
  }

  async listBootstrapEvidence(sessionId: string): Promise<readonly BootstrapEvidence[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/bootstrap-sessions/${sessionId}/evidence`);
    return (await response.json()) as readonly BootstrapEvidence[];
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    const response = await this.fetchImpl(`${this.baseUrl}/runs/${runId}`);
    if (response.status === 404) {
      return undefined;
    }
    return (await response.json()) as RunRecord;
  }

  async getCommand(commandId: string): Promise<CommandRecord | undefined> {
    const response = await this.fetchImpl(`${this.baseUrl}/commands/${commandId}`);
    return response.status === 404 ? undefined : await response.json() as CommandRecord;
  }

  async getOverrideAudit(overrideAuditId: string): Promise<OverrideAudit | undefined> {
    const response = await this.fetchImpl(`${this.baseUrl}/audits/override/${overrideAuditId}`);
    return response.status === 404 ? undefined : await response.json() as OverrideAudit;
  }

  async submitCommand(input: CommandInput): Promise<CommandResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return (await response.json()) as CommandResult;
  }

  async submitSync(
    intent: 're-sync-state' | 'rebuild-graph',
    input: SyncCommandInput,
  ): Promise<CommandResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/sync/${intent}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return (await response.json()) as CommandResult;
  }

  async createBootstrapSession(
    path: 'new-book' | 'import',
    bookName?: string,
    config?: BootstrapConfig,
  ): Promise<{ readonly result: CommandResult; readonly sessionId: string }> {
    const sessionId = crypto.randomUUID();
    const result = await this.submitCommand({
      workspaceId: config?.workspaceId ?? 'workspace-local',
      bookId: config?.bookId ?? 'book-local',
      systemTaskType: 'create-bootstrap-session',
      intent: 'create-bootstrap-session',
      requestedBy: 'author-local',
      approvalMode: 'manual',
      idempotencyKey: `bootstrap-create-${sessionId}`,
      sessionId,
      path,
      ...(bookName === undefined ? {} : { bookName }),
    });
    return { result, sessionId };
  }

  openRunStream(runId: string): EventSource {
    return new EventSource(`${this.baseUrl}/runs/${runId}/stream`);
  }
}

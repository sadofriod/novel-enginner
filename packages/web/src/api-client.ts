import type { ArtifactSummary, RunRecord } from '@novel-enginner/services/runtime/store';
import type { CommandResult } from '@novel-enginner/services/runtime/command-handler';

/**
 * Thin `fetch`-based client for the local control surface described in
 * docs/architecture/modules/07-api-events-and-runtime.md §7.5. Kept dependency-free so
 * it can run directly in the SPA bundle without a data-fetching library.
 */
export interface ApiClientOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
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
  readonly idempotencyKey: string;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? '';
    this.fetchImpl = options.fetchImpl ?? fetch;
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

  async getRun(runId: string): Promise<RunRecord | undefined> {
    const response = await this.fetchImpl(`${this.baseUrl}/runs/${runId}`);
    if (response.status === 404) {
      return undefined;
    }
    return (await response.json()) as RunRecord;
  }

  async submitCommand(input: CommandInput): Promise<CommandResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return (await response.json()) as CommandResult;
  }

  openRunStream(runId: string): EventSource {
    return new EventSource(`${this.baseUrl}/runs/${runId}/stream`);
  }
}

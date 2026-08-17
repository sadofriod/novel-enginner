import type { CommandResult } from '@novel-enginner/services/runtime/command-handler';

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
  /** Structured canonical content authored in the per-artifact-type web form. */
  readonly frontmatter?: Record<string, unknown>;
  readonly sections?: Record<string, string>;
  readonly scenes?: Record<string, string>;
  readonly idempotencyKey: string;
}

export interface SyncCommandInput {
  readonly workspaceId: string;
  readonly bookId: string;
  readonly requestedBy: string;
  readonly approvalMode: 'manual';
  readonly idempotencyKey: string;
}

/**
 * Minimal command surface shared by the RTK command panel and the legacy panel
 * adapter. Kept interface-based so any transport (RTK mutation, fetch, CLI) can be
 * plugged in without depending on a concrete fetch client.
 */
export interface CommandApi {
  submitCommand(input: CommandInput): Promise<CommandResult>;
  submitSync(intent: 're-sync-state' | 'rebuild-graph', input: SyncCommandInput): Promise<CommandResult>;
}

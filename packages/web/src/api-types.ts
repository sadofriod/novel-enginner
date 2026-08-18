import type { CommandResult } from '@novel-enginner/services/runtime/command-handler';

export interface BootstrapConfig {
  readonly workspaceId: string;
  readonly bookId: string;
  readonly workspaceRoot: string;
}

export interface ContentTreeNode {
  readonly id: string;
  readonly kind: string;
  readonly path: string;
  readonly label: string;
}

export interface SceneSummary {
  readonly id: string;
  readonly purpose: string;
}

export interface ChapterTreeNode extends ContentTreeNode {
  readonly chapterNumber?: number;
  readonly volumeId?: string;
  readonly scenes: readonly SceneSummary[];
  readonly manuscriptId?: string;
}

export interface VolumeTreeNode extends ContentTreeNode {
  readonly sequenceNumber?: number;
  readonly chapters: readonly ChapterTreeNode[];
}

export interface EntityGroupNode {
  readonly group: string;
  readonly entities: readonly ContentTreeNode[];
}

export interface WorkspaceTree {
  readonly volumes: readonly VolumeTreeNode[];
  readonly entityGroups: readonly EntityGroupNode[];
  readonly planningAnchors: readonly ContentTreeNode[];
  readonly bookDocs: readonly ContentTreeNode[];
  readonly unclassified: readonly ContentTreeNode[];
}

export interface WorkspaceEntityDetail {
  readonly kind: string;
  readonly id: string;
  readonly path: string;
  readonly frontmatter: Record<string, unknown>;
  readonly sections: Readonly<Record<string, string>>;
  readonly scenes: Readonly<Record<string, string>>;
  readonly raw: string;
}

export interface SearchResultItem {
  readonly documentId: string;
  readonly nodeId: string;
  readonly kind: string;
  readonly sourceRef: string;
  readonly text: string;
  readonly similarity: number;
}

export interface SearchResponse {
  readonly status: string;
  readonly query: string;
  readonly results: readonly SearchResultItem[];
}

export interface WorkspaceGraphNode {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly sourceRef: string;
}

export interface WorkspaceGraphEdge {
  readonly id: string;
  readonly type: string;
  readonly sourceId: string;
  readonly targetId: string;
}

export interface WorkspaceGraph {
  readonly status: 'ready' | 'not-ready';
  readonly builtFromSnapshotId?: string;
  readonly nodes: readonly WorkspaceGraphNode[];
  readonly edges: readonly WorkspaceGraphEdge[];
}

export interface CommandInput {
  readonly workspaceId: string;
  readonly bookId: string;
  readonly artifactType?: string;
  readonly systemTaskType?: string;
  readonly targetId?: string;
  readonly proposalIds?: readonly string[];
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

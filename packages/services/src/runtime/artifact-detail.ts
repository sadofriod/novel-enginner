import type { OverrideAudit, ReviewerResult, StableId } from '../domain/schema';

export interface ArtifactEntityVersionRef {
  readonly entityId: StableId;
  readonly version: string;
}

export interface ArtifactFieldDiff {
  readonly field: string;
  readonly canonical?: unknown;
  readonly proposed?: unknown;
  readonly changed: boolean;
}

export interface ArtifactBundledDiffEntry {
  readonly artifactType: string;
  readonly targetId: string;
  readonly changeKind: 'create' | 'update' | 'delete';
  readonly summary: string;
  readonly fields?: ReadonlyArray<{ field: string; before?: unknown; after?: unknown }>;
}

export interface ArtifactProposalDetail {
  readonly basedOnCanonicalVersion: string;
  readonly diffs: readonly ArtifactFieldDiff[];
  readonly entityVersionRefs?: readonly ArtifactEntityVersionRef[];
}

export interface ArtifactGraphNode {
  readonly id: string;
  readonly label: string;
  readonly type: string;
}

export interface ArtifactGraphEdge {
  readonly source: string;
  readonly target: string;
  readonly type: string;
}

export interface ArtifactDerivedGraph {
  readonly status: 'ready' | 'stale' | 'rebuilding';
  readonly latestCanonicalVersion?: string;
  readonly graphSnapshotVersion?: string;
  readonly nodes: readonly ArtifactGraphNode[];
  readonly edges: readonly ArtifactGraphEdge[];
}

export interface ArtifactDetailState {
  readonly proposalDetail?: ArtifactProposalDetail;
  readonly bundledDiff?: readonly ArtifactBundledDiffEntry[];
  readonly reviewerResult?: ReviewerResult;
  readonly derivedGraph?: ArtifactDerivedGraph;
  readonly inlineEditNote?: string;
  readonly overrideAudit?: OverrideAudit;
}

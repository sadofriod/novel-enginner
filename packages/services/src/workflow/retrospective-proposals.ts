import type { Proposal } from '../domain';
import type { ProposalArtifactType } from '../domain/values';
import { createArtifactDraftFromContent } from '../runtime/canonical-draft';
import type { CanonicalDraft } from '../runtime/store';
import { resolveLayoutRuleForPath, type CanonicalEntityKind } from '../workspace/layout';
import { readEntityIdFromMarkdown } from '../workspace/read-entity-id';
import type { WorkspaceFileInput } from '../workspace/sync-engine';

const ARTIFACT_TYPE_BY_KIND: Readonly<Partial<Record<CanonicalEntityKind, ProposalArtifactType>>> = {
  'project-brief': 'project-brief',
  'world-foundation': 'world-foundation',
  'story-blueprint': 'story-blueprint',
  volume: 'volume-outline',
  'chapter-outline': 'chapter-outline',
  'chapter-manuscript': 'chapter-manuscript',
  character: 'character-update',
  faction: 'faction-update',
  location: 'location-update',
  'tech-rule': 'tech-rule-update',
  fact: 'fact-update',
  relationship: 'relationship-update',
  resource: 'resource-update',
};

export interface RetrospectiveProposalItem {
  readonly proposal: Proposal;
  readonly draft: CanonicalDraft;
}

export interface BuildRetrospectiveProposalsInput {
  readonly files: readonly WorkspaceFileInput[];
  readonly runId: string;
  readonly snapshotId: string;
}

function buildRetrospectiveItem(
  file: WorkspaceFileInput,
  input: BuildRetrospectiveProposalsInput,
  index: number,
): RetrospectiveProposalItem | undefined {
  const rule = resolveLayoutRuleForPath(file.path);
  if (rule === undefined) {
    return undefined;
  }
  const artifactType = ARTIFACT_TYPE_BY_KIND[rule.kind];
  if (artifactType === undefined) {
    return undefined;
  }
  const targetId = readEntityIdFromMarkdown(file.content);
  if (targetId === undefined) {
    return undefined;
  }
  const proposalId = `proposal-${input.runId}-${index + 1}`;
  const proposal: Proposal = {
    proposalId,
    artifactType,
    targetId,
    status: 'pending-approval',
    intent: 'propose',
    origin: 'imported',
    basedOnCanonicalVersion: input.snapshotId,
    parentRunId: input.runId,
  };
  try {
    const draft = createArtifactDraftFromContent({ proposalId, artifactType, targetId, content: file.content });
    return { proposal, draft };
  } catch {
    return undefined;
  }
}

/**
 * Builds `pending-approval` proposals (origin `imported`) for existing canonical
 * content so the author can re-approve it through the regular approval queue (存量
 * 重审). Content is carried as proposal drafts keyed to the current snapshot; nothing
 * changes until the author approves, at which point the same content is re-committed
 * through the review gate.
 */
export async function buildRetrospectiveProposals(input: BuildRetrospectiveProposalsInput): Promise<readonly RetrospectiveProposalItem[]> {
  const items: RetrospectiveProposalItem[] = [];
  for (const [index, file] of input.files.entries()) {
    const item = buildRetrospectiveItem(file, input, index);
    if (item !== undefined) {
      items.push(item);
    }
  }
  return items;
}

import type { Proposal } from '../../domain';
import type { ProposalArtifactType } from '../../domain/values';
import { createArtifactDraftFromContent } from '../../runtime/canonical-draft';
import type { CanonicalDraft } from '../../runtime/store';
import { readEntityIdFromMarkdown } from '../../workspace/read-entity-id';
import type { BootstrapImportFileEntry } from '../types';
import type { ImportMapping } from './import-mapper';

const ARTIFACT_TYPE_BY_IMPORT_KIND: Readonly<Partial<Record<string, ProposalArtifactType>>> = {
  'project-brief': 'project-brief',
  'world-foundation': 'world-foundation',
  'story-blueprint': 'story-blueprint',
  volume: 'volume-outline',
  chapter: 'chapter-outline',
  location: 'location-update',
};

export interface ImportProposalItem {
  readonly proposal: Proposal;
  readonly draft: CanonicalDraft;
}

export interface BuildImportProposalsInput {
  readonly mapping: ImportMapping;
  readonly runId: string;
  readonly snapshotId: string;
  /** Reads the source content for a mapping entry; injected so the builder stays pure. */
  readonly readContent: (sourcePath: string) => Promise<string>;
}

export interface BuildImportProposalsResult {
  readonly items: readonly ImportProposalItem[];
  /** Source paths that cannot be proposed (unmapped kind, missing entity id, or invalid canonical draft). */
  readonly isolatedPaths: readonly string[];
}

/**
 * Builds the `pending-approval` proposals (origin `imported`) for a confirmed import
 * mapping. Canonical content is carried as proposal drafts — nothing is written to
 * the canonical workspace until the author approves. Entries that cannot form a
 * valid canonical draft are isolated rather than silently proposed.
 */
async function buildImportItem(
  entry: BootstrapImportFileEntry,
  input: BuildImportProposalsInput,
  index: number,
): Promise<ImportProposalItem | undefined> {
  const artifactType = ARTIFACT_TYPE_BY_IMPORT_KIND[entry.detectedKind];
  if (artifactType === undefined || entry.canonicalTarget === undefined) {
    return undefined;
  }
  const content = await input.readContent(entry.sourcePath);
  const targetId = readEntityIdFromMarkdown(content);
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
    const draft = createArtifactDraftFromContent({ proposalId, artifactType, targetId, content });
    return { proposal, draft };
  } catch {
    return undefined;
  }
}

export async function buildImportProposals(input: BuildImportProposalsInput): Promise<BuildImportProposalsResult> {
  const items: ImportProposalItem[] = [];
  const isolatedPaths: string[] = [];
  for (const [index, entry] of input.mapping.entries.entries()) {
    const item = await buildImportItem(entry, input, index);
    if (item === undefined) {
      isolatedPaths.push(entry.sourcePath);
    } else {
      items.push(item);
    }
  }
  return { items, isolatedPaths };
}

/**
 * Embedding dispatch: persists summary-layer search documents and enqueues
 * them for out-of-process vector embedding, per
 * docs/architecture/modules/08-graph-search-and-capabilities.md §8.4 and
 * docs/architecture/modules/10-v1-execution-plan.md Phase 9.
 *
 * Design contract:
 * - Only summary-layer text (character/faction/location/clue/chapter summaries)
 *   is sent for embedding, never full manuscript body text.
 * - The embedding itself is produced by an out-of-process job (e.g., an Inngest
 *   step or a periodic background worker). This module only persists the text +
 *   metadata rows and marks them as `embedded: false`.
 * - Content hashes allow incremental re-embedding: if `contentHash` is unchanged
 *   the row is skipped, keeping the index cheap to maintain.
 * - The graph layer remains non-authoritative: search_documents can always be
 *   rebuilt from a canonical WorkspaceSnapshot via `buildDerivedGraph`.
 */

import type { SearchDocument } from './types';
import { prisma } from '../persistence/client';

export interface EmbeddingDispatchOptions {
  readonly workspaceId: string;
  readonly bookId: string;
}

/**
 * Upserts search documents into `search_documents` and resets `embedded = false`
 * for any row whose `contentHash` changed (so the out-of-process embedding job
 * will re-embed it). Rows whose hash is unchanged are left untouched.
 *
 * Returns counts of new/updated/skipped documents for observability.
 */
export async function dispatchEmbeddings(
  documents: readonly SearchDocument[],
  options: EmbeddingDispatchOptions,
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const doc of documents) {
    const existing = await prisma.searchDocument.findUnique({
      where: { documentId: doc.id },
      select: { contentHash: true, embedded: true },
    });

    if (existing === null) {
      await prisma.searchDocument.create({
        data: {
          documentId: doc.id,
          workspaceId: options.workspaceId,
          bookId: options.bookId,
          nodeId: doc.nodeId,
          kind: doc.kind,
          sourceRef: doc.sourceRef,
          text: doc.text,
          contentHash: doc.contentHash,
          embedded: false,
        },
      });
      created += 1;
    } else if (existing.contentHash !== doc.contentHash) {
      await prisma.searchDocument.update({
        where: { documentId: doc.id },
        data: {
          text: doc.text,
          contentHash: doc.contentHash,
          sourceRef: doc.sourceRef,
          embedded: false,
        },
      });
      updated += 1;
    } else {
      skipped += 1;
    }
  }

  return { created, updated, skipped };
}

/**
 * Marks a document as embedded after the out-of-process job has written the
 * embedding vector directly to the database via raw SQL.
 */
export async function markDocumentEmbedded(documentId: string): Promise<void> {
  await prisma.searchDocument.update({
    where: { documentId },
    data: { embedded: true },
  });
}

/**
 * Returns all document IDs that need (re-)embedding in the given workspace.
 * The out-of-process embedding job should poll this list and process each entry.
 */
export async function listPendingEmbeddings(
  workspaceId: string,
): Promise<readonly { documentId: string; text: string; kind: string }[]> {
  return prisma.searchDocument.findMany({
    where: { workspaceId, embedded: false },
    select: { documentId: true, text: true, kind: true },
    orderBy: { createdAt: 'asc' },
  });
}

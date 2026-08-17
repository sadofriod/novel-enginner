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
import { buildDerivedGraph } from './derive/build';
import type { WorkspaceSnapshot } from '../workspace/sync-engine';
import { EMBEDDING_DIMENSION, writeEmbedding } from './vector-search';

export interface EmbeddingDispatchOptions {
  readonly workspaceId: string;
  readonly bookId: string;
}

export interface DerivedSearchRebuildResult {
  readonly snapshotId: string;
  readonly documentCount: number;
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
}

export interface EmbeddingProvider {
  readonly providerId: string;
  embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
}

export interface PendingEmbeddingProcessResult {
  readonly providerId: string;
  readonly processedDocumentIds: readonly string[];
}

export function validateEmbeddingBatch(
  documentIds: readonly string[],
  embeddings: readonly (readonly number[])[],
): void {
  if (documentIds.length !== embeddings.length) {
    throw new Error(
      `Embedding provider returned ${embeddings.length} vectors for ${documentIds.length} documents.`,
    );
  }
  const invalidIndex = embeddings.findIndex((embedding) => embedding.length !== EMBEDDING_DIMENSION);
  if (invalidIndex !== -1) {
    throw new Error(
      `Embedding at index ${invalidIndex} must have length ${EMBEDDING_DIMENSION}, got ${embeddings[invalidIndex]?.length ?? 0}.`,
    );
  }
}

export async function processPendingEmbeddings(input: {
  readonly workspaceId: string;
  readonly provider: EmbeddingProvider;
  readonly batchSize?: number;
}): Promise<PendingEmbeddingProcessResult> {
  const pending = await listPendingEmbeddings(input.workspaceId);
  const batchSize = Math.max(1, Math.floor(input.batchSize ?? 32));
  const processedDocumentIds: string[] = [];

  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    const documentIds = batch.map((document) => document.documentId);
    const embeddings = await input.provider.embed(batch.map((document) => document.text));
    validateEmbeddingBatch(documentIds, embeddings);
    await Promise.all(
      embeddings.map((embedding, index) =>
        writeEmbedding(documentIds[index] as string, embedding, {
          workspaceId: input.workspaceId,
          bookId: batch[index]?.bookId as string,
        }),
      ),
    );
    processedDocumentIds.push(...documentIds);
  }

  return { providerId: input.provider.providerId, processedDocumentIds };
}

/** Rebuilds the derived graph and summary search rows from one canonical snapshot. */
export async function rebuildDerivedSearchIndex(
  snapshot: WorkspaceSnapshot,
  options: EmbeddingDispatchOptions,
): Promise<DerivedSearchRebuildResult> {
  const graph = buildDerivedGraph(snapshot);
  const counts = await dispatchEmbeddings(graph.searchDocuments, options);
  return {
    snapshotId: snapshot.snapshotId,
    documentCount: graph.searchDocuments.length,
    ...counts,
  };
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
      where: {
        workspaceId_bookId_documentId: {
          workspaceId: options.workspaceId,
          bookId: options.bookId,
          documentId: doc.id,
        },
      },
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
        where: {
          workspaceId_bookId_documentId: {
            workspaceId: options.workspaceId,
            bookId: options.bookId,
            documentId: doc.id,
          },
        },
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
export async function markDocumentEmbedded(documentId: string, scope?: EmbeddingDispatchOptions): Promise<void> {
  await prisma.searchDocument.updateMany({
    where: scope === undefined ? { documentId } : { documentId, ...scope },
    data: { embedded: true },
  });
}

/**
 * Returns all document IDs that need (re-)embedding in the given workspace.
 * The out-of-process embedding job should poll this list and process each entry.
 */
export async function listPendingEmbeddings(
  workspaceId: string,
): Promise<readonly { documentId: string; bookId: string; text: string; kind: string }[]> {
  return prisma.searchDocument.findMany({
    where: { workspaceId, embedded: false },
    select: { documentId: true, bookId: true, text: true, kind: true },
    orderBy: { createdAt: 'asc' },
  });
}

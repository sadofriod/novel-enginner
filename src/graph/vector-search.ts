/**
 * pgvector-based vector search for the summary layer, per
 * docs/architecture/modules/08-graph-search-and-capabilities.md §8.4 and
 * docs/architecture/modules/10-v1-execution-plan.md Phase 9.
 *
 * Design contract:
 * - Structural relationship queries take precedence; vector search is a supplement.
 * - Only summary-layer documents (character/chapter/faction/clue/location summaries)
 *   are indexed — never raw manuscript body text.
 * - Similarity queries use cosine distance via the IVFFlat index created in migration
 *   `20260101000001_enable_pgvector_and_search_documents`.
 * - Embedding vectors are written to Postgres via raw SQL (pgvector `vector` type is
 *   not natively supported by Prisma), while metadata reads use the Prisma client.
 *
 * Embedding dimension: 1536 (OpenAI text-embedding-3-small).
 */

import { prisma } from '../persistence/client';

export const EMBEDDING_DIMENSION = 1536;

export interface VectorSearchResult {
  readonly documentId: string;
  readonly nodeId: string;
  readonly kind: string;
  readonly sourceRef: string;
  readonly text: string;
  readonly similarity: number;
}

export interface VectorSearchOptions {
  readonly workspaceId: string;
  readonly bookId?: string;
  readonly limit?: number;
  /** Optional: restrict results to specific node kinds. */
  readonly kinds?: readonly string[];
}

/**
 * Writes an embedding vector for a single document. Uses raw SQL because Prisma
 * does not natively support the pgvector `vector` type.
 *
 * @param documentId  The `documentId` column of the search_documents row.
 * @param embedding   Float32 array of length `EMBEDDING_DIMENSION` (1536).
 */
export async function writeEmbedding(documentId: string, embedding: readonly number[]): Promise<void> {
  if (embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Expected embedding of length ${EMBEDDING_DIMENSION}, got ${embedding.length} for documentId "${documentId}".`,
    );
  }
  const vectorLiteral = `[${embedding.join(',')}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE search_documents
     SET embedding = $1::vector, embedded = true, "updatedAt" = now()
     WHERE "documentId" = $2`,
    vectorLiteral,
    documentId,
  );
}

/**
 * Performs an approximate nearest-neighbour cosine-similarity search against
 * the summary-layer vector index.
 *
 * @param queryEmbedding  Float32 array of length `EMBEDDING_DIMENSION`.
 * @param options         Workspace scope and optional filters.
 */
export async function vectorSearch(
  queryEmbedding: readonly number[],
  options: VectorSearchOptions,
): Promise<readonly VectorSearchResult[]> {
  if (queryEmbedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Query embedding must have length ${EMBEDDING_DIMENSION}, got ${queryEmbedding.length}.`,
    );
  }

  // Validate and clamp limit to a safe positive integer so it can be
  // interpolated directly into the SQL LIMIT clause without risk of
  // invalid SQL or unexpected behaviour from caller-supplied values.
  const limit = Math.max(1, Math.floor(options.limit ?? 10));

  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  // Build WHERE clause and parameter list dynamically to avoid duplicating
  // the filter logic across multiple query branches.
  const whereClauses: string[] = ['"workspaceId" = $2', 'embedded = true'];
  const params: unknown[] = [vectorLiteral, options.workspaceId];

  if (options.bookId !== undefined) {
    params.push(options.bookId);
    whereClauses.push(`"bookId" = $${params.length}`);
  }

  if (options.kinds !== undefined && options.kinds.length > 0) {
    params.push(options.kinds);
    whereClauses.push(`kind = ANY($${params.length}::text[])`);
  }

  const whereClause = whereClauses.join(' AND ');

  const rows = await prisma.$queryRawUnsafe<VectorSearchResult[]>(
    `SELECT "documentId", "nodeId", kind, "sourceRef", text,
            1 - (embedding <=> $1::vector) AS similarity
     FROM search_documents
     WHERE ${whereClause}
     ORDER BY embedding <=> $1::vector
     LIMIT ${limit}`,
    ...params,
  );
  return rows;
}

-- Migration: enable pgvector extension and add vector column to search_documents.
--
-- Scope (docs/architecture/modules/08-graph-search-and-capabilities.md §8.4 and
-- docs/architecture/modules/10-v1-execution-plan.md Phase 9):
-- - Enable the pgvector extension so `vector` type columns are available.
-- - Add the `embedding vector(1536)` column to search_documents (created by Prisma
--   migration) using a raw SQL ALTER TABLE since Prisma does not natively support
--   the `vector` type.
-- - Create an ivfflat approximate-nearest-neighbour index on the embedding column
--   using cosine distance, per §8.4 ("结构化关系检索优先；向量检索作为补充").
-- - Create the search_documents table itself (Prisma does not generate it because
--   the embedding column is Unsupported, so we define the full CREATE TABLE here).
--
-- Prerequisites: PostgreSQL >= 14, pgvector >= 0.5.0 installed as a server extension.

-- 1. Enable the pgvector extension.
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create the search_documents table (mirrors the Prisma model definition).
--    The `embedding` column is vector(1536) — OpenAI text-embedding-3-small dimension.
CREATE TABLE IF NOT EXISTS search_documents (
    id            TEXT        NOT NULL,
    "documentId"  TEXT        NOT NULL,
    "workspaceId" TEXT        NOT NULL,
    "bookId"      TEXT        NOT NULL,
    "nodeId"      TEXT        NOT NULL,
    kind          TEXT        NOT NULL,
    "sourceRef"   TEXT        NOT NULL,
    text          TEXT        NOT NULL,
    "contentHash" TEXT        NOT NULL,
    embedded      BOOLEAN     NOT NULL DEFAULT false,
    embedding     vector(1536),
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT search_documents_pkey PRIMARY KEY (id),
    CONSTRAINT search_documents_documentId_key UNIQUE ("documentId")
);

-- 3. Standard indexes (match Prisma @@index definitions).
CREATE INDEX IF NOT EXISTS search_documents_workspaceId_bookId_idx
    ON search_documents ("workspaceId", "bookId");

CREATE INDEX IF NOT EXISTS search_documents_nodeId_idx
    ON search_documents ("nodeId");

CREATE INDEX IF NOT EXISTS search_documents_contentHash_idx
    ON search_documents ("contentHash");

-- 4. IVFFlat ANN index for cosine-distance vector search.
--    lists=100 is a reasonable starting point for up to ~1M documents; tune with
--    the dataset size (rule of thumb: sqrt(n_rows)).
CREATE INDEX IF NOT EXISTS search_documents_embedding_cosine_idx
    ON search_documents
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- GitHub PR-review style proposal review comments: a review submission
-- (disposition: request-changes), line-anchored inline threads, and flat
-- comments within each thread. All rows cascade with their proposal.
CREATE TABLE IF NOT EXISTS "proposal_reviews" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "disposition" TEXT NOT NULL,
  "overallComment" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proposal_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "proposal_reviews_reviewId_key" ON "proposal_reviews"("reviewId");
CREATE INDEX IF NOT EXISTS "proposal_reviews_proposalId_idx" ON "proposal_reviews"("proposalId");
ALTER TABLE "proposal_reviews"
  ADD CONSTRAINT "proposal_reviews_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "proposals"("proposalId")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "review_threads" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "lineSnapshot" TEXT NOT NULL,
  "isResolved" BOOLEAN NOT NULL DEFAULT false,
  "resolvedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_threads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "review_threads_threadId_key" ON "review_threads"("threadId");
CREATE INDEX IF NOT EXISTS "review_threads_proposalId_idx" ON "review_threads"("proposalId");
ALTER TABLE "review_threads"
  ADD CONSTRAINT "review_threads_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "proposals"("proposalId")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "review_comments" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "author" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_comments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "review_comments_commentId_key" ON "review_comments"("commentId");
CREATE INDEX IF NOT EXISTS "review_comments_threadId_idx" ON "review_comments"("threadId");
ALTER TABLE "review_comments"
  ADD CONSTRAINT "review_comments_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "review_threads"("threadId")
  ON DELETE CASCADE ON UPDATE CASCADE;

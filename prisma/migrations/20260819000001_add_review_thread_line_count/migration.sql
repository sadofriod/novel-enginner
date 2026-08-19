-- Support GitHub-PR-review-style multi-line comment anchors: a thread may span
-- a range of lines (`lineCount >= 1`); existing single-line threads keep the
-- default value 1.
ALTER TABLE "review_threads"
  ADD COLUMN IF NOT EXISTS "lineCount" INTEGER NOT NULL DEFAULT 1;

-- Record the provenance of a proposal: author-typed (author), LLM-generated
-- (generated), or produced from an imported book (imported). Defaults to
-- 'author' so existing rows remain valid.
ALTER TABLE "proposals"
  ADD COLUMN IF NOT EXISTS "origin" TEXT NOT NULL DEFAULT 'author';

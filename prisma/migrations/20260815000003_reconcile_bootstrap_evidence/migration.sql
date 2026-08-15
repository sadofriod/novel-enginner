-- Preserve existing evidence while completing metadata required by the
-- BootstrapEvidence repository and abandoned-session retention query.
ALTER TABLE "bootstrap_evidence"
  ADD COLUMN IF NOT EXISTS "copyrightBoundary" TEXT NOT NULL DEFAULT 'review-required',
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft';
-- A prior local bootstrap table may predate the session metadata fields. These
-- additions are idempotent and preserve all existing session/revision evidence.
ALTER TABLE "bootstrap_sessions"
  ADD COLUMN IF NOT EXISTS "bookName" TEXT,
  ADD COLUMN IF NOT EXISTS "sessionType" TEXT,
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
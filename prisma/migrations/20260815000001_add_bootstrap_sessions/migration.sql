CREATE TABLE "bootstrap_sessions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bookId" TEXT,
    "status" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "currentRevisionId" TEXT,
    "bookName" TEXT,
    "sessionType" TEXT,
    "completedAt" TIMESTAMP(3),
    "abandonedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bootstrap_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bootstrap_revisions" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "authorInput" JSONB,
    "structuredDraft" JSONB,
    "importMapping" JSONB,
    "diagnostics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bootstrap_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bootstrap_evidence" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleanedSummary" TEXT,
    "licenseScope" TEXT NOT NULL,
    "copyrightBoundary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bootstrap_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bootstrap_sessions_sessionId_key" ON "bootstrap_sessions"("sessionId");
CREATE INDEX "bootstrap_sessions_workspaceId_idx" ON "bootstrap_sessions"("workspaceId");
CREATE INDEX "bootstrap_sessions_status_idx" ON "bootstrap_sessions"("status");
CREATE INDEX "bootstrap_sessions_stage_idx" ON "bootstrap_sessions"("stage");
CREATE INDEX "bootstrap_sessions_abandonedAt_idx" ON "bootstrap_sessions"("abandonedAt");

CREATE UNIQUE INDEX "bootstrap_revisions_revisionId_key" ON "bootstrap_revisions"("revisionId");
CREATE INDEX "bootstrap_revisions_sessionId_idx" ON "bootstrap_revisions"("sessionId");
CREATE INDEX "bootstrap_revisions_stage_idx" ON "bootstrap_revisions"("stage");
CREATE INDEX "bootstrap_revisions_expiresAt_idx" ON "bootstrap_revisions"("expiresAt");

CREATE UNIQUE INDEX "bootstrap_evidence_evidenceId_key" ON "bootstrap_evidence"("evidenceId");
CREATE INDEX "bootstrap_evidence_revisionId_idx" ON "bootstrap_evidence"("revisionId");
CREATE INDEX "bootstrap_evidence_url_idx" ON "bootstrap_evidence"("url");

ALTER TABLE "bootstrap_revisions"
ADD CONSTRAINT "bootstrap_revisions_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "bootstrap_sessions"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bootstrap_evidence"
ADD CONSTRAINT "bootstrap_evidence_revisionId_fkey"
FOREIGN KEY ("revisionId") REFERENCES "bootstrap_revisions"("revisionId") ON DELETE CASCADE ON UPDATE CASCADE;
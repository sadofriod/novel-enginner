-- Enable pgvector before any vector-typed columns are introduced in later
-- phases (capability embeddings, semantic search, etc.). This migration is
-- intentionally hand-authored (not `prisma migrate dev` generated) so the
-- extension statement ships ahead of any `Unsupported("vector")` columns.
CREATE EXTENSION IF NOT EXISTS vector;

-- Proposals
CREATE TABLE "proposals" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "basedOnCanonicalVersion" TEXT NOT NULL,
    "entityVersionRefs" JSONB,
    "parentRunId" TEXT NOT NULL,
    "supersedesProposalId" TEXT,
    "latestReviewResultId" TEXT,
    "overrideAuditId" TEXT,
    "bundledDiffRefs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "proposals_proposalId_key" ON "proposals"("proposalId");
CREATE INDEX "proposals_workspaceId_bookId_idx" ON "proposals"("workspaceId", "bookId");
CREATE INDEX "proposals_targetId_idx" ON "proposals"("targetId");
CREATE INDEX "proposals_status_idx" ON "proposals"("status");

-- Runs
CREATE TABLE "runs" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "commandIntent" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "basedOnCanonicalVersion" TEXT,
    "driftReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "runs_runId_key" ON "runs"("runId");
CREATE UNIQUE INDEX "runs_workspaceId_idempotencyKey_key" ON "runs"("workspaceId", "idempotencyKey");
CREATE INDEX "runs_workspaceId_bookId_idx" ON "runs"("workspaceId", "bookId");
CREATE INDEX "runs_status_idx" ON "runs"("status");

ALTER TABLE "proposals" ADD CONSTRAINT "proposals_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "runs"("runId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Run steps / checkpoints
CREATE TABLE "run_steps" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "isCheckpoint" BOOLEAN NOT NULL DEFAULT false,
    "input" JSONB,
    "output" JSONB,
    "errorReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "run_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "run_steps_runId_sequence_key" ON "run_steps"("runId", "sequence");
CREATE INDEX "run_steps_runId_stepKey_idx" ON "run_steps"("runId", "stepKey");

ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_runId_fkey" FOREIGN KEY ("runId") REFERENCES "runs"("runId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reviewer results
CREATE TABLE "reviewer_results" (
    "id" TEXT NOT NULL,
    "reviewResultId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "hardFailures" JSONB NOT NULL,
    "dimensionScores" JSONB NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "rewriteDirectives" JSONB NOT NULL,
    "overrideEligible" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviewer_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reviewer_results_reviewResultId_key" ON "reviewer_results"("reviewResultId");
CREATE INDEX "reviewer_results_proposalId_idx" ON "reviewer_results"("proposalId");

ALTER TABLE "reviewer_results" ADD CONSTRAINT "reviewer_results_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("proposalId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Override audits
CREATE TABLE "override_audits" (
    "id" TEXT NOT NULL,
    "overrideAuditId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "overrideReason" TEXT NOT NULL,
    "overrideBy" TEXT NOT NULL,
    "relatedRunId" TEXT NOT NULL,
    "failedChecks" JSONB NOT NULL,
    "scoreSnapshot" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "override_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "override_audits_overrideAuditId_key" ON "override_audits"("overrideAuditId");
CREATE INDEX "override_audits_proposalId_idx" ON "override_audits"("proposalId");
CREATE INDEX "override_audits_relatedRunId_idx" ON "override_audits"("relatedRunId");

ALTER TABLE "override_audits" ADD CONSTRAINT "override_audits_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("proposalId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "override_audits" ADD CONSTRAINT "override_audits_relatedRunId_fkey" FOREIGN KEY ("relatedRunId") REFERENCES "runs"("runId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Synthetic commits
CREATE TABLE "synthetic_commits" (
    "id" TEXT NOT NULL,
    "syntheticCommitId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "targetFilePaths" JSONB NOT NULL,
    "aggregatedFrom" JSONB,
    "canonicalVersion" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "synthetic_commits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "synthetic_commits_syntheticCommitId_key" ON "synthetic_commits"("syntheticCommitId");
CREATE INDEX "synthetic_commits_workspaceId_bookId_idx" ON "synthetic_commits"("workspaceId", "bookId");

-- Capability discovery snapshots
CREATE TABLE "capability_discovery_snapshots" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "capabilityId" TEXT,
    "source" TEXT,
    "details" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capability_discovery_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "capability_discovery_snapshots_snapshotId_key" ON "capability_discovery_snapshots"("snapshotId");
CREATE INDEX "capability_discovery_snapshots_workspaceId_idx" ON "capability_discovery_snapshots"("workspaceId");
CREATE INDEX "capability_discovery_snapshots_status_idx" ON "capability_discovery_snapshots"("status");

-- Derived rebuild jobs
CREATE TABLE "derived_rebuild_jobs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bookId" TEXT,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "triggeredBy" TEXT,
    "runId" TEXT,
    "errorReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "derived_rebuild_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "derived_rebuild_jobs_jobId_key" ON "derived_rebuild_jobs"("jobId");
CREATE INDEX "derived_rebuild_jobs_workspaceId_bookId_idx" ON "derived_rebuild_jobs"("workspaceId", "bookId");
CREATE INDEX "derived_rebuild_jobs_status_idx" ON "derived_rebuild_jobs"("status");

ALTER TABLE "derived_rebuild_jobs" ADD CONSTRAINT "derived_rebuild_jobs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "runs"("runId") ON DELETE SET NULL ON UPDATE CASCADE;

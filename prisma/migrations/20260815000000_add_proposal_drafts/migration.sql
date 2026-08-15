CREATE TABLE "proposal_drafts" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "proposal_drafts_proposalId_key" ON "proposal_drafts"("proposalId");

ALTER TABLE "proposal_drafts"
ADD CONSTRAINT "proposal_drafts_proposalId_fkey"
FOREIGN KEY ("proposalId") REFERENCES "proposals"("proposalId") ON DELETE CASCADE ON UPDATE CASCADE;

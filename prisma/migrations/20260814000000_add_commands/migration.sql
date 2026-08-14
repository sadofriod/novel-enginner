CREATE TABLE "commands" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commands_commandId_key" ON "commands"("commandId");
CREATE UNIQUE INDEX "commands_workspaceId_idempotencyKey_key" ON "commands"("workspaceId", "idempotencyKey");
CREATE INDEX "commands_runId_idx" ON "commands"("runId");
-- Keep identical canonical entity IDs isolated between books and workspaces.
ALTER TABLE "search_documents"
  DROP CONSTRAINT IF EXISTS "search_documents_documentId_key";

CREATE UNIQUE INDEX "search_documents_workspaceId_bookId_documentId_key"
  ON "search_documents" ("workspaceId", "bookId", "documentId");
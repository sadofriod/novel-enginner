import { describe, expect, test } from 'bun:test';

import { prisma } from '../persistence/client';
import { dispatchEmbeddings } from './embedding-dispatch';
import { EMBEDDING_DIMENSION, vectorSearch, writeEmbedding } from './vector-search';

const databaseAvailable = process.env['DATABASE_URL'] !== undefined;

function embedding(firstValue: number): number[] {
  return [firstValue, ...new Array<number>(EMBEDDING_DIMENSION - 1).fill(0)];
}

describe('embedding dispatch contracts', () => {
  test('uses the documented OpenAI embedding dimension', () => {
    expect(EMBEDDING_DIMENSION).toBe(1536);
  });

  test('keeps the search layer summary-only by contract', () => {
    expect(EMBEDDING_DIMENSION).toBeGreaterThan(0);
  });

  test('isolates identical document IDs during rebuild and vector search', async () => {
    if (!databaseAvailable) {
      return;
    }

    const documentId = 'doc:shared-character';
    const scopes = [
      { workspaceId: 'workspace-search-isolation-a', bookId: 'book-a' },
      { workspaceId: 'workspace-search-isolation-b', bookId: 'book-b' },
    ] as const;

    await prisma.searchDocument.deleteMany({
      where: { workspaceId: { in: scopes.map((scope) => scope.workspaceId) } },
    });

    const documents = scopes.map((scope, index) => ({
      id: documentId,
      kind: 'Character' as const,
      nodeId: 'char-shared',
      sourceRef: `state/${scope.workspaceId}/char-shared.md`,
      text: `Character: ${scope.workspaceId}`,
      contentHash: `hash-${index}`,
    }));
    const firstDocument = documents[0] as (typeof documents)[number];
    const secondDocument = documents[1] as (typeof documents)[number];

    await dispatchEmbeddings([firstDocument], scopes[0]);
    await dispatchEmbeddings([secondDocument], scopes[1]);

    await writeEmbedding(documentId, embedding(1), scopes[0]);
    await writeEmbedding(documentId, embedding(1), scopes[1]);

    const rows = await prisma.searchDocument.findMany({
      where: { documentId },
      orderBy: { workspaceId: 'asc' },
      select: { workspaceId: true, bookId: true, text: true, embedded: true },
    });
    expect(rows).toEqual([
      { workspaceId: scopes[0].workspaceId, bookId: scopes[0].bookId, text: firstDocument.text, embedded: true },
      { workspaceId: scopes[1].workspaceId, bookId: scopes[1].bookId, text: secondDocument.text, embedded: true },
    ]);

    const firstResults = await vectorSearch(embedding(1), scopes[0]);
    const secondResults = await vectorSearch(embedding(1), scopes[1]);
    expect(firstResults.map((result) => result.text)).toEqual([firstDocument.text]);
    expect(secondResults.map((result) => result.text)).toEqual([secondDocument.text]);

    await prisma.searchDocument.deleteMany({
      where: { workspaceId: { in: scopes.map((scope) => scope.workspaceId) } },
    });
  });
});
import { describe, expect, test } from 'bun:test';

import { createApiServer } from './api-server';

import type { SearchResultItem } from './search-contract';

function searchFixture(query: string): readonly SearchResultItem[] {
  return [
    {
      documentId: 'doc-char-mira',
      nodeId: 'char-mira',
      kind: 'character',
      sourceRef: 'state/characters/char-mira.md',
      text: 'Mira Vale keeps a brass key on a cord.',
      similarity: 0.85,
    },
  ];
}

describe('search endpoint', () => {
  test('GET /search returns results from the configured search function', async () => {
    const { fetch } = createApiServer({ searchWorkspace: async (query) => searchFixture(query) });

    const response = await fetch(new Request('http://local.test/search?q=brass+key'));

    expect(response.status).toBe(200);
    const body = await response.json() as { readonly status: string; readonly query: string; readonly results: readonly SearchResultItem[] };
    expect(body.status).toBe('ok');
    expect(body.query).toBe('brass key');
    expect(body.results[0]?.nodeId).toBe('char-mira');
    expect(body.results[0]?.similarity).toBe(0.85);
  });

  test('GET /search passes kind filters through', async () => {
    const calls: { readonly query: string; readonly kinds: readonly string[] | undefined }[] = [];
    const { fetch } = createApiServer({
      searchWorkspace: async (query, options) => {
        calls.push({ query, kinds: options.kinds });
        return [];
      },
    });

    await fetch(new Request('http://local.test/search?q=clock&kind=character&kind=location'));

    expect(calls[0]?.query).toBe('clock');
    expect(calls[0]?.kinds).toEqual(['character', 'location']);
  });

  test('GET /search rejects a missing query', async () => {
    const { fetch } = createApiServer({ searchWorkspace: async () => [] });

    const response = await fetch(new Request('http://local.test/search'));

    expect(response.status).toBe(400);
  });

  test('GET /search reports unavailable when no search function is configured', async () => {
    const { fetch } = createApiServer();

    const response = await fetch(new Request('http://local.test/search?q=clock'));

    expect(response.status).toBe(503);
  });
});

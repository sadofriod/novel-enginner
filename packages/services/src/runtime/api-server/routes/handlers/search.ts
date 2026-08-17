import { jsonResponse } from '../../transport/http';

import type { RouteHandlerDeps } from './context';

export interface SearchHandlers {
  readonly handleSearch: (request: Request) => Promise<Response>;
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return 10;
  }
  return Math.min(50, Math.max(1, Math.floor(value)));
}

function parseSearchRequest(url: URL): { readonly query: string; readonly limit: number; readonly kinds: readonly string[] } {
  const query = url.searchParams.get('q')?.trim() ?? '';
  const limit = clampLimit(Number.parseInt(url.searchParams.get('limit') ?? '10', 10));
  const kinds = url.searchParams.getAll('kind').filter((kind) => kind.length > 0);
  return { query, limit, kinds };
}

export function createSearchHandlers(deps: RouteHandlerDeps): SearchHandlers {
  const { options, logger } = deps;
  const search = options.searchWorkspace;
  const workspaceId = process.env['NOVEL_WORKSPACE_ID'] ?? 'workspace-local';
  const bookId = process.env['NOVEL_BOOK_ID'] ?? 'book-local';

  async function handleSearch(request: Request): Promise<Response> {
    const { query, limit, kinds } = parseSearchRequest(new URL(request.url));
    if (query.length === 0) {
      return jsonResponse({ status: 'rejected', code: 'bad-request', message: 'Missing search query "q".' }, 400);
    }
    if (search === undefined) {
      logger.warn({ query }, 'Semantic search is not configured');
      return jsonResponse({ status: 'rejected', code: 'unavailable', message: 'Semantic search is not configured.' }, 503);
    }
    const results = await search(query, {
      workspaceId,
      bookId,
      limit,
      ...(kinds.length === 0 ? {} : { kinds }),
    });
    logger.info({ query, count: results.length }, 'Search completed');
    return jsonResponse({ status: 'ok', query, results });
  }

  return { handleSearch };
}

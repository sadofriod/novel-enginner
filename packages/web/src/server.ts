/* eslint-disable complexity */

import { renderControlConsolePage } from './app/pages/ControlConsolePage';
import type { ArtifactSummary, RunRecord } from '@novel-enginner/services/runtime/store';

const port = Number.parseInt(process.env['WEB_PORT'] ?? '3001', 10);
const serviceUrl = process.env['SERVICE_URL'] ?? 'http://localhost:3000';

type ConsoleData = {
  readonly artifacts: readonly ArtifactSummary[];
  readonly runs: readonly RunRecord[];
};

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('WEB_PORT must be an integer between 1 and 65535.');
}

async function renderApp(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const data = await loadConsoleData();
  const page = resolvePageContext(requestUrl, data);
  return new Response(renderControlConsolePage({ ...data, ...page }), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function renderSpaShell(): Response {
  return new Response(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Novel Enginner</title>
    <script src="/assets/client.js" defer></script>
  </head>
  <body><div id="web-app-root"></div></body>
</html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function resolvePageContext(
  requestUrl: URL,
  data: ConsoleData,
): {
  readonly selectedArtifact: ArtifactSummary | undefined;
  readonly workspaceId: string;
  readonly bookId: string;
} {
  const workspaceId = requestUrl.searchParams.get('workspaceId');
  const bookId = requestUrl.searchParams.get('bookId');
  return {
    selectedArtifact: resolveSelectedArtifact(data.artifacts, requestUrl),
    workspaceId: resolveContextId(workspaceId, data.runs[0]?.workspaceId, 'workspace-local'),
    bookId: resolveContextId(bookId, data.runs[0]?.bookId, 'book-local'),
  };
}

function resolveContextId(value: string | null, runValue: string | undefined, fallback: string): string {
  return value ?? runValue ?? fallback;
}

async function loadConsoleData(): Promise<ConsoleData> {
  const [artifactsResponse, runsResponse] = await Promise.all([
    fetch(`${serviceUrl}/artifacts`),
    fetch(`${serviceUrl}/runs`),
  ]);
  return {
    artifacts: await artifactsResponse.json() as readonly ArtifactSummary[],
    runs: await runsResponse.json() as readonly RunRecord[],
  };
}

function resolveSelectedArtifact(
  artifacts: readonly ArtifactSummary[],
  requestUrl: URL,
): ArtifactSummary | undefined {
  const artifactType = requestUrl.searchParams.get('artifactType');
  const targetId = requestUrl.searchParams.get('targetId');
  if (artifactType === null || targetId === null) {
    return artifacts[0];
  }
  return artifacts.find((artifact) => artifact.artifactType === artifactType && artifact.targetId === targetId);
}

async function proxyToService(request: Request, pathname: string): Promise<Response> {
  const targetUrl = new URL(pathname.replace(/^\/api/, ''), serviceUrl);
  targetUrl.search = new URL(request.url).search;
  const headers = new Headers(request.headers);
  headers.delete('connection');
  headers.delete('content-length');
  headers.delete('host');
  const requestInit: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    requestInit.body = await request.text();
  }
  return fetch(new Request(targetUrl, requestInit));
}

async function fetchWeb(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/assets/client.js') {
    return new Response(Bun.file(new URL('../dist/client.js', import.meta.url)), {
      headers: { 'content-type': 'text/javascript; charset=utf-8' },
    });
  }
  if (url.pathname === '/app') {
    return renderApp(request);
  }
  if (url.pathname === '/' || url.pathname.startsWith('/bootstrap/')) {
    return renderSpaShell();
  }
  if (url.pathname.startsWith('/api/')) {
    return proxyToService(request, url.pathname);
  }
  return new Response('Not found', { status: 404 });
}

Bun.serve({ port, idleTimeout: 0, fetch: fetchWeb });

console.log(`Novel Enginner web listening on http://localhost:${port}`);

import { createApiServer } from './api-server';
import { seedWebConsoleFixture } from './seed-web-fixtures';

const port = Number.parseInt(process.env['PORT'] ?? '3000', 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const apiServer = createApiServer();

if (process.env['NOVEL_E2E_FIXTURE'] === '1') {
  seedWebConsoleFixture(apiServer.store);
}

Bun.serve({
  port,
  fetch: apiServer.fetch,
});

console.log(`Novel Enginner API listening on http://localhost:${port}`);
import { defineConfig } from '@playwright/test';

const port = 3210;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env['CI'] !== undefined ? 2 : 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `PORT=${port} NOVEL_E2E_FIXTURE=1 bun run src/runtime/server.ts`,
    url: `http://127.0.0.1:${port}/app`,
    reuseExistingServer: process.env['CI'] === undefined,
    timeout: 30_000,
  },
});

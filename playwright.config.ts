import { defineConfig } from '@playwright/test';

const port = 3210;
const apiPort = 3211;

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
  webServer: [
    {
      command: `NODE_ENV=test SERVICE_PORT=${apiPort} NOVEL_E2E_FIXTURE=1 pnpm dev:services`,
      url: `http://127.0.0.1:${apiPort}/artifacts`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `WEB_PORT=${port} SERVICE_URL=http://127.0.0.1:${apiPort} pnpm dev:web`,
      url: `http://127.0.0.1:${port}/app`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});

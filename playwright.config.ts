import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  workers: 1,
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: { command: 'pnpm dev:web', url: 'http://localhost:5173', reuseExistingServer: true },
});

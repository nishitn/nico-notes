import { defineConfig } from '@playwright/test';

// Local fixture only: no Convex deployment, auth credentials or backend setup.
export default defineConfig({
  testDir: '.',
  testMatch: ['navigation-guard.spec.ts', 'public-pages.spec.ts'],
  timeout: 20_000,
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm --filter @nico-notes/web exec vp dev --host 127.0.0.1 --port 5174',
    url: 'http://127.0.0.1:5174/test-fixtures/navigation.html',
    reuseExistingServer: true,
  },
});

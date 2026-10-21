import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'apps/web/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: {
      args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'],
    },
  },
  webServer: {
    command:
      'pnpm --filter @chiptide/web build && pnpm --filter @chiptide/web preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

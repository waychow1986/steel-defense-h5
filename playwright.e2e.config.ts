import { defineConfig, devices } from '@playwright/test';

const external = process.env.E2E_BASE_URL;
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  workers: 1,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: external ?? `http://localhost:${port}`,
    viewport: { width: 1280, height: 800 },
  },
  webServer: external
    ? undefined
    : {
        command: `npx vite preview --port ${port} --strictPort`,
        url: `http://localhost:${port}/`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});

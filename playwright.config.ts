import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.IT_PORT ?? 5174);

export default defineConfig({
  testDir: 'tests/integration',
  testMatch: '**/*.spec.ts',
  workers: 2,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: `npx vite --port ${port} --strictPort --bypass-lock`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { IT_PORT: String(port) },
  },
});

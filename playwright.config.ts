import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: /(e2e|compat)\/.*\.spec\.ts$/,
  timeout: 30000,
  fullyParallel: true,
  workers: 6,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8787',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve.mjs 8787',
    url: 'http://localhost:8787/tests/e2e/harness.html',
    reuseExistingServer: true,
    timeout: 20000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});

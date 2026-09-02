import { defineConfig } from '@playwright/test'

export default defineConfig({
  globalTeardown: './teardown.ts',
  testDir: '.',
  testMatch: 'quick-record.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://127.0.0.1:4190',
    viewport: { width: 375, height: 667 },
    launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node serve.mjs',
    url: 'http://127.0.0.1:4190/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: 'SIGINT', timeout: 1_000 }
  }
})

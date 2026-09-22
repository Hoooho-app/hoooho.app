import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  globalTeardown: './teardown.ts',
  testDir: '.',
  // The legacy quick-record drawer and its embedded nurse video were removed by
  // the four-entry records-module contract. Their source specs remain as history;
  // this suite now exercises only the production entry points that still exist.
  testMatch: ['medication-record.spec.ts', 'vaccination-record.spec.ts', 'visit-record.spec.ts', 'records-module.spec.ts'],
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    ...devices['iPhone SE'],
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:4190',
    viewport: { width: 375, height: 667 },
    launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node --import ../health-timeline-oral-text-stress/windows-fs-retry-preload.mjs serve.mjs',
    url: 'http://127.0.0.1:4190/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: 'SIGINT', timeout: 1_000 }
  }
})

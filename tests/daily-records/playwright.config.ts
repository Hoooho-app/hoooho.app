import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', workers: 1, timeout: 60_000,
  outputDir: '../../test-results/daily-records',
  globalTeardown: './teardown.ts',
  use: { ...devices['iPhone SE'], browserName: 'chromium', timezoneId: 'Asia/Shanghai', serviceWorkers: 'block', baseURL: 'http://127.0.0.1:4197', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node serve.mjs', url: 'http://127.0.0.1:4197/api/health', reuseExistingServer: false, timeout: 30_000 }
})

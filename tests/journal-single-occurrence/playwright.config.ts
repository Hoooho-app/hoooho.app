import { defineConfig, devices } from '@playwright/test'
const origin = `http://127.0.0.1:${process.env.HOOOHO_TIME_VIEW_PORT ?? '4196'}`
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', workers: 1, timeout: 60_000,
  globalTeardown: '../time-view/teardown.ts', outputDir: '../../test-results/journal-single-occurrence',
  use: { ...devices['iPhone SE'], viewport: { width: 375, height: 667 }, browserName: 'chromium', timezoneId: 'Asia/Shanghai', serviceWorkers: 'block', baseURL: origin, launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node ../time-view/serve.mjs', url: `${origin}/api/health`, env: { HOOOHO_TIME_VIEW_PORT: process.env.HOOOHO_TIME_VIEW_PORT ?? '4196' }, reuseExistingServer: false, timeout: 30_000 }
})

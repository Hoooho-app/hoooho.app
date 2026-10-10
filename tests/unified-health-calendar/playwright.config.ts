import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', workers: 1, timeout: 60_000,
  globalTeardown: '../time-view/teardown.ts', outputDir: '../../test-results/unified-health-calendar',
  use: { ...devices['iPhone SE'], browserName: 'chromium', timezoneId: 'Asia/Shanghai', baseURL: 'http://127.0.0.1:4194', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node ../time-view/serve.mjs', url: 'http://127.0.0.1:4194/api/health', reuseExistingServer: false, timeout: 30_000 },
})

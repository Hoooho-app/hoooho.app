import { defineConfig, devices } from '@playwright/test'

const origin = process.env.BOWEL_TEST_URL || 'http://127.0.0.1:4293'
export default defineConfig({
  testDir: '.', testMatch: 'bowel-form.spec.ts', workers: 1, timeout: 45000,
  globalTeardown: process.env.BOWEL_TEST_URL ? undefined : '../time-view/teardown.ts',
  outputDir: '../../test-results/bowel-form',
  use: { ...devices['iPhone SE'], browserName: 'chromium', baseURL: origin,
    timezoneId: 'Asia/Shanghai', serviceWorkers: 'block',
    launchOptions: process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : undefined,
    trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: process.env.BOWEL_TEST_URL ? undefined : {
    command: 'node tests/time-view/serve.mjs', env: { HOOOHO_TIME_VIEW_PORT: '4293' },
    cwd: '../..', url: `${origin}/api/health`, reuseExistingServer: false, timeout: 30000
  }
})

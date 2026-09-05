import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  globalTeardown: './teardown.ts',
  testDir: '.', testMatch: 'time-view.spec.ts', workers: 1, timeout: 45_000,
  use: { ...devices['iPhone SE'], browserName: 'chromium', timezoneId: 'Asia/Shanghai', baseURL: 'http://127.0.0.1:4194', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node serve.mjs', url: 'http://127.0.0.1:4194/api/health', reuseExistingServer: false, timeout: 30_000 }
})

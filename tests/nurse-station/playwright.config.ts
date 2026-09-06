import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'nurse-station.spec.ts',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  use: {
    ...devices['iPhone SE'],
    baseURL: 'http://127.0.0.1:4196',
    browserName: 'chromium',
    launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
    viewport: { width: 375, height: 667 },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node tests/guest-session/serve.mjs',
    cwd: '../..',
    url: 'http://127.0.0.1:4196/api/health',
    reuseExistingServer: true,
    timeout: 30_000
  }
})

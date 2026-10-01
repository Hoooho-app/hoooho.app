import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  globalTeardown: './teardown.ts',
  testDir: '.',
  outputDir: '../../test-results/nurse-station',
  testMatch: 'nurse-station.spec.ts',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  use: {
    ...devices['iPhone SE'],
    baseURL: 'http://127.0.0.1:4297',
    browserName: 'chromium',
    launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
    viewport: { width: 375, height: 667 },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node tests/nurse-station/serve.mjs',
    cwd: '../..',
    url: 'http://127.0.0.1:4297/api/health',
    env: { NURSE_TEST_PORT: '4297' },
    reuseExistingServer: false,
    timeout: 30_000
  }
})

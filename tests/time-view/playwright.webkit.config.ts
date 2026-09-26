import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  globalTeardown: './teardown.ts',
  testDir: '.',
  testMatch: 'time-view.spec.ts',
  grep: /compact hour cells stop at now/,
  workers: 1,
  timeout: 45_000,
  use: {
    ...devices['iPhone SE'],
    browserName: 'webkit',
    timezoneId: 'Asia/Shanghai',
    baseURL: 'http://127.0.0.1:4194',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node serve.mjs',
    url: 'http://127.0.0.1:4194/api/health',
    reuseExistingServer: false,
    timeout: 30_000
  }
})

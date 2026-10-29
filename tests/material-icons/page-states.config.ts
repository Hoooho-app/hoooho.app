import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

const port = '4289'
export default defineConfig({
  testDir: '.', testMatch: 'page-states.spec.ts', workers: 1, timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: '../../test-results/material-icon-states',
  reporter: [['line'], ['json', { outputFile: path.resolve(import.meta.dirname, '../../test-results/material-icon-states/results.json') }]],
  globalTeardown: '../auth-account/teardown.ts',
  use: {
    ...devices['iPhone SE'], browserName: 'chromium', baseURL: `http://127.0.0.1:${port}`,
    timezoneId: 'Asia/Shanghai', serviceWorkers: 'block',
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--disable-dev-shm-usage'] }
  },
  projects: [
    { name: 'mobile-375', use: { viewport: { width: 375, height: 667 } } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 } } },
    { name: 'mobile-430', use: { viewport: { width: 430, height: 932 } } }
  ],
  webServer: {
    cwd: path.resolve(import.meta.dirname, '../..'), command: 'node tests/auth-account/serve.mjs',
    env: { AUTH_TEST_PORT: port }, url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false, timeout: 30_000
  }
})

import { defineConfig } from '@playwright/test'

export default defineConfig({

  globalTeardown: './teardown.ts',
  testDir: '.',
  testMatch: 'paper.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: '../../.codex-tmp/design-quality-results',
  use: {
    baseURL: 'http://127.0.0.1:4196',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'iphone-se', use: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
    { name: 'mobile-430', use: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 800 } } }
  ],
  webServer: {
    command: 'node serve.mjs',
    url: 'http://127.0.0.1:4196/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: 'SIGINT', timeout: 1_000 }
  }
})

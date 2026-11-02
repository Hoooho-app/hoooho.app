import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.', testMatch: 'growth.spec.ts', workers: 1, fullyParallel: false,
  outputDir: '../../.codex-tmp/data-fixes/browser-results', reporter: 'line',
  timeout: 120_000, expect: { timeout: 15_000 },
  use: { baseURL: 'http://127.0.0.1:4198', serviceWorkers: 'block', timezoneId: 'Asia/Shanghai' },
  projects: [
    { name: 'mobile-375', use: { browserName: 'chromium', viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true } },
    { name: 'desktop-1280', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
  ],
  webServer: { command: 'node ../health-profile-growth-card/serve.mjs', url: 'http://127.0.0.1:4198/api/health', reuseExistingServer: false, timeout: 45_000, gracefulShutdown: { signal: 'SIGTERM', timeout: 2_000 } },
})

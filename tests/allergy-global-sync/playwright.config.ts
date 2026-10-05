import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.', testMatch: 'allergy-global-sync.spec.ts', workers: 1, timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:4209', browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block', trace: 'retain-on-failure' },
  outputDir: '../../.codex-tmp/allergy-global-sync-results',
  webServer: { command: 'node serve.mjs', url: 'http://127.0.0.1:4209/api/health', reuseExistingServer: false, timeout: 30_000, gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 } }
})

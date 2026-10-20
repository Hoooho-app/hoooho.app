import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  testDir: '.', testMatch: 'month-calendar.spec.ts', workers: 1, fullyParallel: false,
  timeout: 120_000, expect: { timeout: 15_000 },
  outputDir: '../../.codex-tmp/family-month-calendar-results',
  use: { baseURL: 'http://127.0.0.1:4217', browserName: 'chromium', viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { cwd: fileURLToPath(new URL('../..', import.meta.url)), command: 'FAMILY_TEST_PORT=4217 node tests/family-workspace/serve.mjs', url: 'http://127.0.0.1:4217/api/health', reuseExistingServer: false, timeout: 30_000, gracefulShutdown: { signal: 'SIGINT', timeout: 2000 } }
})

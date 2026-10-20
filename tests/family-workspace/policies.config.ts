import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  testDir: '.', testMatch: 'policies.spec.ts', workers: 1, fullyParallel: false,
  timeout: 120_000, expect: { timeout: 12_000 }, outputDir: '../../.codex-tmp/family-policy-results',
  use: { baseURL: 'http://127.0.0.1:4207', browserName: 'chromium', viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block', actionTimeout: 12_000, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { cwd: fileURLToPath(new URL('../..', import.meta.url)), command: 'node tests/family-workspace/serve.mjs', env: { FAMILY_TEST_PORT: '4207' }, url: 'http://127.0.0.1:4207/api/health', reuseExistingServer: false, timeout: 30_000, gracefulShutdown: { signal: 'SIGINT', timeout: 2000 } }
})

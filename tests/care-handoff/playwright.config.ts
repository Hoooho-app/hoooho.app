import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '.', testMatch: 'care-handoff.spec.ts', workers: 1, timeout: 30_000,
  outputDir: '../../test-results/care-handoff',
  use: { baseURL: 'http://127.0.0.1:4691', viewport: { width: 390, height: 844 }, serviceWorkers: 'block', launchOptions: { args: ['--no-sandbox', '--disable-dev-shm-usage'] }, screenshot: 'only-on-failure' },
  webServer: { command: 'node serve.mjs', url: 'http://127.0.0.1:4691/api/health', timeout: 30_000 }
})

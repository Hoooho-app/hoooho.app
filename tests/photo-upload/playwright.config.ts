import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', workers: 1, fullyParallel: false,
  timeout: 45000, expect: { timeout: 15000 },
  outputDir: '../../.codex-tmp/photo-fix/browser-results',
  use: { actionTimeout: 10000, baseURL: 'http://127.0.0.1:4196', serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [375, 430].map(width => ({ name: `mobile-${width}`, use: { browserName: 'chromium' as const, viewport: { width, height: 812 }, launchOptions: { args: ['--no-sandbox'] } } })),
  webServer: {
    command: 'VISIT_AI_TEST=1 VISIT_BAILIAN_TEST=1 AI_MAX_CALLS_PER_ACCOUNT_HOUR=1000 node tests/visit-sheet/serve.mjs',
    cwd: '../..', url: 'http://127.0.0.1:4196/api/health', reuseExistingServer: false, timeout: 40000,
  },
})

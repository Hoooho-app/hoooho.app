import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  testDir: '.', testMatch: ['family-workspace.spec.ts', 'photos-asset-attachments.spec.ts'], workers: 1, fullyParallel: false,
  timeout: 90_000, expect: { timeout: 15_000 },
  outputDir: '../../.codex-tmp/family-workspace-results',
  use: { baseURL: 'http://127.0.0.1:4197', browserName: 'chromium', viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block', actionTimeout: 15_000, navigationTimeout: 20_000, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { cwd: fileURLToPath(new URL('../..', import.meta.url)), command: 'node tests/family-workspace/serve.mjs', url: 'http://127.0.0.1:4197/api/health', reuseExistingServer: false, timeout: 30_000, gracefulShutdown: { signal: 'SIGINT', timeout: 2000 } }
})

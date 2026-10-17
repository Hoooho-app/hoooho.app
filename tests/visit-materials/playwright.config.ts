import { defineConfig } from '@playwright/test'
import path from 'node:path'
export default defineConfig({
  testDir: '.', workers: 1, timeout: 90000, expect: { timeout: 25000 },
  outputDir: '../../outputs/visit-materials/local',
  use: { baseURL: 'http://127.0.0.1:5196', viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { cwd: path.resolve(import.meta.dirname, '../..'), command: 'node tests/visit-sheet/serve.mjs', env: { VISIT_AI_TEST: '1', VISIT_BAILIAN_TEST: '1', VISIT_E2E_PORT: '5196', VISIT_E2E_DEV_PORT: '5197', VISIT_CONTROL_PORT: '5198', AI_MAX_CALLS_PER_ACCOUNT_HOUR: '1000' }, url: 'http://127.0.0.1:5196/api/health', timeout: 60000 }
})

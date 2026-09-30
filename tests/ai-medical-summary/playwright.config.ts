import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
export default defineConfig({
  testDir: '.', workers: 1, timeout: 45000,
  globalTeardown: '../visit-sheet/teardown.mjs',
  use: { ...devices['iPhone SE'], browserName: 'chromium', timezoneId: 'Asia/Shanghai',
    launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
    baseURL: 'http://127.0.0.1:4196', serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node tests/visit-sheet/serve.mjs',
    cwd: path.resolve(import.meta.dirname, '../..'), env: { VISIT_AI_TEST: '1' },
    url: 'http://127.0.0.1:4196/api/health', reuseExistingServer: false, timeout: 30000 }
})

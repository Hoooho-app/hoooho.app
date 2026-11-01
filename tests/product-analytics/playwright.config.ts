import { defineConfig } from '@playwright/test'
import path from 'node:path'
export default defineConfig({ testDir: '.', workers: 1, timeout: 60000, expect: { timeout: 15000 },
  use: { baseURL: 'http://127.0.0.1:4268', viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block', launchOptions: { args: ['--no-sandbox'] }, trace: 'retain-on-failure' },
  webServer: { command: 'node tests/product-analytics/serve.mjs', cwd: path.resolve(import.meta.dirname, '../..'), url: 'http://127.0.0.1:4268/api/health', timeout: 60000 } })

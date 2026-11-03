import { defineConfig } from '@playwright/test'
import path from 'node:path'
export default defineConfig({ testDir: '.', workers: 1, timeout: 45000, expect: { timeout: 15000 }, use: { baseURL: 'http://127.0.0.1:4236', timezoneId: 'Asia/Shanghai', serviceWorkers: 'block', launchOptions: { args: ['--no-sandbox'] }, trace: 'retain-on-failure' }, webServer: { command: 'node tests/usage-monitoring/serve.mjs', cwd: path.resolve(import.meta.dirname, '../..'), url: 'http://127.0.0.1:4236/api/health', timeout: 60000, gracefulShutdown: { signal: 'SIGTERM', timeout: 1000 } } })

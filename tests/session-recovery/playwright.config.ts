import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

process.env.AUTH_TEST_PORT ||= '4279'
const origin = `http://127.0.0.1:${process.env.AUTH_TEST_PORT}`
const proxyUrl = process.env.RECOVERY_TEST_URL && (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)
const proxy = proxyUrl ? new URL(proxyUrl) : undefined
export default defineConfig({
  testDir: '..', testMatch: process.env.RECOVERY_TEST_URL ? ['session-recovery/session-recovery.spec.ts'] : ['session-recovery/session-recovery.spec.ts', 'auth-account/auth-account.spec.ts'], workers: 1, timeout: 45000,
  globalTeardown: process.env.RECOVERY_TEST_URL ? undefined : '../auth-account/teardown.ts',
  use: { ...devices['iPhone SE'], browserName: 'chromium', baseURL: process.env.RECOVERY_TEST_URL || origin, serviceWorkers: 'block', trace: 'retain-on-failure', proxy: proxy ? { server: proxy.origin, username: decodeURIComponent(proxy.username), password: decodeURIComponent(proxy.password) } : undefined },
  webServer: process.env.RECOVERY_TEST_URL ? undefined : {
    cwd: path.resolve(import.meta.dirname, '../..'), command: 'node tests/auth-account/serve.mjs',
    env: { AUTH_TEST_PORT: process.env.AUTH_TEST_PORT }, url: `${origin}/api/health`, reuseExistingServer: false, timeout: 30000
  }
})

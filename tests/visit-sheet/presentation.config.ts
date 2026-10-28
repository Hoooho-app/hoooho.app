import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'presentation.spec.ts',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  globalTeardown: './teardown.mjs',
  outputDir: '../../test-results/visit-paper',
  use: {
    baseURL: 'http://127.0.0.1:4263',
    serviceWorkers: 'block',
    timezoneId: 'Asia/Shanghai',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-375', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: 'mobile-430', use: { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: 'node serve.mjs',
    env: { VISIT_E2E_PORT: '4263', VISIT_CONTROL_PORT: '4264', VISIT_E2E_DEV_PORT: '4265', VISIT_AI_TEST: '1', TZ: 'Asia/Shanghai' },
    url: 'http://127.0.0.1:4263/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})

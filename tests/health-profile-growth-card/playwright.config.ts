import { defineConfig } from '@playwright/test'

export default defineConfig({
  globalTeardown: './teardown.ts',
  testDir: '.',
  testMatch: 'health-profile-growth-card.spec.ts',
  outputDir: '../../.codex-tmp/health-profile-growth-card-results',
  reporter: 'line',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: { baseURL: process.env.HEALTH_PROFILE_BASE_URL ?? 'http://127.0.0.1:4198', screenshot: 'only-on-failure', serviceWorkers: 'block', timezoneId: 'Asia/Shanghai' },
  projects: [
    { name: 'iphone-se', use: { browserName: 'chromium', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, viewport: { width: 375, height: 667 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
    { name: 'mobile-390', use: { browserName: 'chromium', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
    { name: 'mobile-430', use: { browserName: 'chromium', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, viewport: { width: 430, height: 932 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
    { name: 'desktop-1280', use: { browserName: 'chromium', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, viewport: { width: 1280, height: 900 } } }
  ],
  webServer: {
    command: 'node serve.mjs',
    url: 'http://127.0.0.1:4198/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: 'SIGINT', timeout: 1_000 }
  }
})

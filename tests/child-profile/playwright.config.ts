import { defineConfig } from '@playwright/test'

export default defineConfig({
  globalTeardown: './teardown.ts',
  testDir: '.',
  testMatch: 'child-profile.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: '../../.codex-tmp/child-profile-results',
  use: {
    baseURL: 'http://127.0.0.1:4194',
    timezoneId: 'Asia/Shanghai',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'iphone-se', use: { browserName: 'chromium', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, viewport: { width: 375, height: 667 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
    { name: 'mobile-375', use: { browserName: 'chromium', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
    { name: 'mobile-390', use: { browserName: 'chromium', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
    { name: 'mobile-430', use: { browserName: 'chromium', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, viewport: { width: 430, height: 932 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
    { name: 'wechat-webview', use: { browserName: 'chromium', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, viewport: { width: 375, height: 667 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.54' } },
    { name: 'safari-iphone', use: { browserName: 'webkit', viewport: { width: 375, height: 667 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
    { name: 'tablet-768', use: { browserName: 'chromium', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
    { name: 'desktop-1280', use: { browserName: 'chromium', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, viewport: { width: 1280, height: 900 } } }
  ],
  webServer: {
    command: 'node serve.mjs',
    url: 'http://127.0.0.1:4194/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: 'SIGINT', timeout: 1_000 }
  }
})

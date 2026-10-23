import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.', testMatch: 'welcome.spec.ts', workers: 1, timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4208',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'small-mobile', use: { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true } },
    { name: 'mobile', use: { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true } },
    { name: 'large-mobile', use: { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } }
  ],
  webServer: {
    command: 'node tests/welcome/serve.mjs', cwd: '../..',
    url: 'http://127.0.0.1:4208/api/health', reuseExistingServer: false,
    timeout: 30_000, gracefulShutdown: { signal: 'SIGINT', timeout: 1_000 }
  }
})

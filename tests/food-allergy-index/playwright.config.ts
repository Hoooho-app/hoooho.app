import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', workers: 1, timeout: 60000,
  outputDir: '../../.codex-tmp/food-index-results',
  use: { baseURL: 'http://127.0.0.1:4328', serviceWorkers: 'block', timezoneId: 'Asia/Shanghai', screenshot: 'only-on-failure' },
  projects: [
    { name: 'iphone-se', use: { ...devices['iPhone SE (3rd gen)'], defaultBrowserType: 'chromium', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } } },
    ...[390, 430].map(width => ({ name: 'mobile-' + width, use: { viewport: { width, height: 844 }, isMobile: true, hasTouch: true, launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } } }))
  ],
  webServer: { command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4328 --strictPort', cwd: '../..', url: 'http://127.0.0.1:4328/login', reuseExistingServer: true }
})

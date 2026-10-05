import { defineConfig, devices } from '@playwright/test'

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const liveBaseUrl = process.env.DIETARY_BASE_URL

export default defineConfig({
  testDir: '.',
  testMatch: 'dietary-card.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: '../../.codex-tmp/dietary-card-results',
  use: { baseURL: liveBaseUrl || 'http://127.0.0.1:4199', locale: 'zh-CN', serviceWorkers: 'block', timezoneId: 'Asia/Shanghai', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'iphone-se', use: { ...devices['iPhone SE'], browserName: 'chromium', launchOptions: { executablePath: chrome }, viewport: { width: 375, height: 667 } } },
    { name: 'mobile-390', use: { ...devices['iPhone 13'], browserName: 'chromium', launchOptions: { executablePath: chrome } } },
    { name: 'mobile-430', use: { ...devices['iPhone 15 Pro Max'], browserName: 'chromium', launchOptions: { executablePath: chrome } } },
    { name: 'desktop', use: { browserName: 'chromium', launchOptions: { executablePath: chrome }, viewport: { width: 1280, height: 900 } } }
  ],
  webServer: liveBaseUrl ? undefined : {
    command: 'npm run dev -- --host 127.0.0.1 --port 4199',
    url: 'http://127.0.0.1:4199/login',
    reuseExistingServer: true,
    timeout: 30_000,
  }
})

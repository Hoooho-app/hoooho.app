import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:5173'
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000
  },
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'iphone-se', use: { ...devices['iPhone SE'], viewport: { width: 375, height: 667 } } },
    { name: 'mobile-390', use: { ...devices['iPhone SE'], viewport: { width: 390, height: 844 } } },
    { name: 'mobile-430-wechat', use: { ...devices['iPhone SE'], viewport: { width: 430, height: 932 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.50' } }
  ]
})

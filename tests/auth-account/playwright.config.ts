import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: '.', testMatch: 'auth-account.spec.ts', workers: 1, timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4196', ...devices['iPhone SE'], browserName: 'chromium',
    launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }, trace: 'off' },
  webServer: { command: 'node tests/auth-account/serve.mjs', cwd: '../..', url: 'http://127.0.0.1:4196/api/health', reuseExistingServer: false, timeout: 30000 }
})

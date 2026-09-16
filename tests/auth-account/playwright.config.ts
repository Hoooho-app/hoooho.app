import { defineConfig, devices } from '@playwright/test'
const origin = `http://127.0.0.1:${process.env.AUTH_TEST_PORT || '4196'}`
export default defineConfig({
  globalTeardown: './teardown.ts',
  testDir: '.', testMatch: 'auth-account.spec.ts', workers: 1, timeout: 60000,
  use: { baseURL: origin, ...devices['iPhone SE'], trace: 'off' },
  projects: [
    { name: 'chrome', use: { browserName: 'chromium', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } } },
    { name: 'webkit', use: { browserName: 'webkit' } }
  ],
  webServer: {
    command: 'node tests/auth-account/serve.mjs',
    cwd: '../..',
    url: `${origin}/api/health`,
    reuseExistingServer: false,
    timeout: 30000,
    gracefulShutdown: { signal: 'SIGINT', timeout: 1_000 }
  }
})

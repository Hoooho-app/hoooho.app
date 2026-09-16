import { defineConfig } from '@playwright/test'

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

export default defineConfig({
  testDir: '.',
  testMatch: 'allergy-closed-loop.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: '../../.codex-tmp/allergy-closed-loop-results',
  use: { baseURL: 'http://127.0.0.1:4196', serviceWorkers: 'block', timezoneId: 'Asia/Shanghai', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'iphone-se', use: { browserName: 'chromium', launchOptions: { executablePath: chrome }, viewport: { width: 375, height: 667 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { browserName: 'chromium', launchOptions: { executablePath: chrome }, viewport: { width: 1280, height: 900 } } }
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4196',
    url: 'http://127.0.0.1:4196/login',
    reuseExistingServer: true,
    timeout: 30_000,
    gracefulShutdown: { signal: 'SIGINT', timeout: 1_000 }
  }
})

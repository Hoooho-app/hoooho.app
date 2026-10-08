import { defineConfig, devices } from '@playwright/test'
const executablePath = process.env.VISIT_E2E_CHROMIUM_PATH || (process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)
export default defineConfig({
  testDir: '.',
  testMatch: 'visit-sheet.spec.ts',
  globalTeardown: './teardown.mjs',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  use: {
    serviceWorkers: 'block', // fault-injection routing must reach the browser transport
    baseURL: 'http://127.0.0.1:4196',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {name:'strictmode-se',testMatch:'strictmode.spec.ts',use:{...devices['iPhone SE (3rd gen)'],browserName:'chromium',launchOptions:{executablePath},baseURL:'http://127.0.0.1:4197'}},
    {
      name: 'iphone-se',
      use: { ...devices['iPhone SE (3rd gen)'], browserName: 'chromium', launchOptions:{executablePath} },
    },
    {name:'mobile-393',use:{browserName:'chromium',viewport:{width:393,height:852},launchOptions:{executablePath}}},
    ...[320, 390, 420, 430].map((width) => ({
      name: `mobile-${width}`,
      use: {
        browserName: 'chromium' as const,
        viewport: { width, height: 844 },
        launchOptions: {
          executablePath,
        },
      },
    })),
    {
      name: 'desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 900 },
        launchOptions: {
          executablePath,
        },
      },
    },
    {
      name: 'webkit-se',
      use: { ...devices['iPhone SE (3rd gen)'], browserName: 'webkit' },
    },
  ],
  webServer: {
    command: 'node serve.mjs',
    url: 'http://127.0.0.1:4196/api/health',
    reuseExistingServer: false,
    timeout: 30000,
  },
})

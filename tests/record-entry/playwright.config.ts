import { defineConfig,devices } from '@playwright/test'
export default defineConfig({
  testDir:'.', testMatch:'record-entry.spec.ts', workers:1, timeout:60_000,
  globalTeardown:'../time-view/teardown.ts',outputDir:'../../test-results/record-entry',
  use:{...devices['iPhone SE'],viewport:{width:375,height:667},browserName:'chromium',timezoneId:'Asia/Shanghai',serviceWorkers:'block',baseURL:'http://127.0.0.1:4194',launchOptions:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'},trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'node ../time-view/serve.mjs',url:'http://127.0.0.1:4194/api/health',reuseExistingServer:false,timeout:30_000}
})

import { defineConfig,devices } from '@playwright/test'
const origin = 'http://127.0.0.1:4194'
export default defineConfig({
  testDir:'.', testMatch:'diet-form.spec.ts', workers:1, timeout:60_000,
  globalTeardown:'../time-view/teardown.ts',outputDir:'../../test-results/diet-form',
  use:{...devices['iPhone SE'],viewport:{width:375,height:667},browserName:'chromium',timezoneId:'Asia/Shanghai',serviceWorkers:'block',baseURL:origin,trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'node ../time-view/serve.mjs',url:`${origin}/api/health`,reuseExistingServer:false,timeout:30_000}
})

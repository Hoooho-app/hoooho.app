import { defineConfig,devices } from '@playwright/test'
export default defineConfig({
  testDir:'.',testMatch:'body-locator.spec.ts',globalTeardown:'./teardown.ts',workers:1,timeout:120_000,
  outputDir:'../../test-results/body-locator',
  use:{baseURL:process.env.BODY_BASE_URL || 'http://127.0.0.1:4197',timezoneId:'Asia/Shanghai',serviceWorkers:'block',launchOptions:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'},trace:'retain-on-failure',screenshot:'only-on-failure',video:'on',actionTimeout:15_000},
  projects:[{name:'iphone-se',use:{...devices['iPhone SE'],viewport:{width:375,height:667},browserName:'chromium'}},{name:'mobile-390',use:{...devices['iPhone 13'],browserName:'chromium'}},{name:'mobile-430',use:{...devices['iPhone 14 Pro Max'],browserName:'chromium'}},{name:'desktop',use:{viewport:{width:1280,height:900}}}],
  webServer:{command:'node serve.mjs',url:'http://127.0.0.1:4197/api/health',reuseExistingServer:false,timeout:30_000}
})

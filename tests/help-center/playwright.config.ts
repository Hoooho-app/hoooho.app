import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir:'.',testMatch:'help-center.spec.ts',workers:1,timeout:30_000,
  outputDir:'../../test-results/help-center',
  use:{baseURL:'http://127.0.0.1:4683',viewport:{width:390,height:844},serviceWorkers:'block',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE},trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'node serve.mjs',url:'http://127.0.0.1:4683/api/health',timeout:30_000}
})

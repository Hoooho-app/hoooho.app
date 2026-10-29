import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '.', testMatch:'appearance.spec.ts',workers:1,timeout:120_000,expect:{timeout:10_000},
  outputDir:'../../test-results/page-appearance',
  use:{baseURL:'http://127.0.0.1:4397',serviceWorkers:'block',trace:'retain-on-failure',screenshot:'only-on-failure',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}},
  projects:[
    {name:'mobile-375',use:{viewport:{width:375,height:667},isMobile:true,hasTouch:true}},
    {name:'mobile-430',use:{viewport:{width:430,height:932},isMobile:true,hasTouch:true}},
  ],
  webServer:{command:'node tests/page-appearance/serve.mjs',cwd:process.cwd(),url:'http://127.0.0.1:4397/api/health',reuseExistingServer:false,timeout:30_000,gracefulShutdown:{signal:'SIGTERM',timeout:1000}},
})

import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
export default defineConfig({
  testDir: '.', testMatch: 'icons.spec.ts', workers: 1, timeout: 30_000,
  outputDir: '../../test-results/material-icons',
  use: { ...devices['iPhone SE'], browserName:'chromium', baseURL:'http://127.0.0.1:4189', serviceWorkers:'block', screenshot:'only-on-failure', launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']} },
  webServer: { cwd:path.resolve(import.meta.dirname,'../..'),command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4189 --strictPort',url:'http://127.0.0.1:4189/tests/material-icons/fixture.html',timeout:30_000,reuseExistingServer:false,env:{DATA_DIRECTORY:'/tmp/hoooho-material-icons-v3-data-915ff179',AI_PROVIDER:'local'} }
})

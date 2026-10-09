import { defineConfig } from '@playwright/test'
const online = process.env.CALENDAR_ACCEPTANCE_URL
export default defineConfig({
 testDir: '.', testMatch: '*.spec.ts', workers: 1, timeout: online ? 60000 : 30000,
 outputDir: '../../test-results/health-calendar',
 use: { browserName:'chromium', launchOptions:{ executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }, timezoneId:'Asia/Shanghai', baseURL:online ?? 'http://127.0.0.1:4273', viewport:{width:375,height:667}, serviceWorkers:'block', screenshot:'only-on-failure', ...(online && process.env.HTTPS_PROXY ? {proxy:{server:process.env.HTTPS_PROXY},ignoreHTTPSErrors:true}: {}) },
 webServer: online ? undefined : { cwd: new URL('../..', import.meta.url).pathname, command:'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4273', url:'http://127.0.0.1:4273', reuseExistingServer:false, timeout:30000 }
})

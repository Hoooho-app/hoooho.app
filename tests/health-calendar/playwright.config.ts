import { defineConfig } from '@playwright/test'
export default defineConfig({
 testDir: '.', testMatch: '*.spec.ts', workers: 1, timeout: 30000,
 outputDir: '../../test-results/health-calendar',
 use: { browserName:'chromium', launchOptions:{ executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }, timezoneId:'Asia/Shanghai', baseURL:'http://127.0.0.1:4273', viewport:{width:390,height:844}, serviceWorkers:'block', screenshot:'only-on-failure' },
 webServer:{ cwd: new URL('../..', import.meta.url).pathname, command:'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4273', url:'http://127.0.0.1:4273', reuseExistingServer:false, timeout:30000 }
})

import {defineConfig,devices} from '@playwright/test'
import {randomUUID} from 'node:crypto'
process.env.BODY_LOCATOR_SHUTDOWN_FILE ??= `${process.cwd()}/.codex-tmp/graphical-locator-${randomUUID()}-shutdown`
export default defineConfig({testDir:'.',outputDir:'../../test-results/graphical-body-locator',testMatch:'graphical.spec.ts',workers:1,timeout:45000,globalTeardown:'./teardown.ts',use:{...devices['iPhone SE'],baseURL:'http://127.0.0.1:4197',serviceWorkers:'block',launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,timeout:20000,args:['--no-sandbox','--disable-dev-shm-usage']},trace:'retain-on-failure'},webServer:{command:'node tests/body-locator/serve.mjs',cwd:process.cwd(),url:'http://127.0.0.1:4197/api/health',timeout:30000,reuseExistingServer:false}})

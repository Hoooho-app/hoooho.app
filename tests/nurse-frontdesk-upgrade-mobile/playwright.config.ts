import {defineConfig,devices} from '@playwright/test'
import path from 'node:path'

export default defineConfig({
  testDir:'.',testMatch:'*.spec.ts',workers:1,timeout:90000,expect:{timeout:20000},
  globalTeardown:'./teardown.mjs',outputDir:'../../test-results/nurse-frontdesk-upgrade-mobile',
  use:{baseURL:'http://127.0.0.1:4867',timezoneId:'Asia/Shanghai',serviceWorkers:'block',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)},
    screenshot:'only-on-failure',trace:'retain-on-failure'},
  projects:[{name:'iphone-se',use:{...devices['iPhone SE (3rd gen)'],browserName:'chromium'}},
    ...[390,430].map(width=>({name:`mobile-${width}`,use:{browserName:'chromium' as const,viewport:{width,height:667}}}))],
  webServer:{cwd:path.resolve(import.meta.dirname,'../..'),command:'node tests/visit-sheet/serve.mjs',
    env:{VISIT_AI_TEST:'1',VISIT_BAILIAN_TEST:'1',VISIT_ASR_TEST:'1',VISIT_E2E_PORT:'4866',VISIT_E2E_DEV_PORT:'4867',VISIT_CONTROL_PORT:'4868',VISIT_SHUTDOWN_FILE:'../nurse-frontdesk-upgrade-mobile/.shutdown',AI_MAX_CALLS_PER_ACCOUNT_HOUR:'1000'},
    url:'http://127.0.0.1:4867/nurse-station',timeout:60000}
})

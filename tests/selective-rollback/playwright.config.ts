import {defineConfig,devices} from '@playwright/test'
import path from 'node:path'
import base from '../dialogue/playwright.config'
export default defineConfig({...base,testDir:'.',testMatch:'rollback.spec.ts',workers:1,globalSetup:'./setup.mjs',globalTeardown:'./teardown.mjs',outputDir:'../../test-results/selective-rollback',
 use:{...base.use,trace:'retain-on-failure',baseURL:'http://127.0.0.1:4957',launchOptions:{...base.use?.launchOptions,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)}},
 projects:[{name:'iphone-se',use:{...devices['iPhone SE'],browserName:'chromium'}},...[320,390,430].map(width=>({name:`mobile-${width}`,use:{browserName:'chromium' as const,viewport:{width,height:667}}}))],
 webServer:{...base.webServer,cwd:path.resolve(import.meta.dirname,'../..'),env:{VISIT_AI_TEST:'1',VISIT_BAILIAN_TEST:'1',VISIT_ASR_TEST:'1',VISIT_E2E_PORT:'4956',VISIT_E2E_DEV_PORT:'4957',VISIT_CONTROL_PORT:'4958',VISIT_SHUTDOWN_FILE:'../selective-rollback/.shutdown',AI_MAX_CALLS_PER_ACCOUNT_HOUR:'1000'},url:'http://127.0.0.1:4957/nurse-station'}})

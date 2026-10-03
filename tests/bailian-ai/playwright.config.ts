import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
export default defineConfig({
  testDir:'..', testMatch:['ai-business/business.spec.ts','ai-medical-summary/medical-summary.spec.ts','bailian-ai/*.spec.ts'], metadata:{provider:'bailian'},
  // qwen3.7-plus is not ASR/TTS. The unchanged OpenAI suite separately covers audio.
  grepInvert:/实际音频采集经过服务端转写/, workers:1, timeout:45000,
  globalTeardown:'../visit-sheet/teardown.mjs',
  use:{...devices['iPhone SE'],browserName:'chromium',timezoneId:'Asia/Shanghai',launchOptions:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']},baseURL:'http://127.0.0.1:4196',serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'node tests/visit-sheet/serve.mjs',cwd:path.resolve(import.meta.dirname,'../..'),env:{VISIT_AI_TEST:'1',VISIT_BAILIAN_TEST:'1',VISIT_E2E_DEV_PORT:'4297'},url:'http://127.0.0.1:4196/api/health',reuseExistingServer:false,timeout:30000},
})

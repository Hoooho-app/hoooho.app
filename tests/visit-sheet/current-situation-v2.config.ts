import {defineConfig,devices} from '@playwright/test'
import base from './playwright.config'
const executablePath=process.env.VISIT_E2E_CHROMIUM_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)
export default defineConfig({...base,testMatch:'current-situation-v2.spec.ts',outputDir:'../../outputs/visit-current-situation-v2/browser',projects:[375,390,430].map(width=>({name:`mobile-${width}`,use:{...devices['iPhone SE'],viewport:{width,height:844},timezoneId:'Asia/Shanghai',browserName:'chromium' as const,launchOptions:{executablePath}}})),webServer:{...base.webServer,command:'node tests/visit-sheet/serve.mjs',cwd:import.meta.dirname+'/../..',env:{VISIT_AI_TEST:'1'}}})

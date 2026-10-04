import {defineConfig} from '@playwright/test'
import baseline from './playwright.config'
export default defineConfig({...baseline,use:{...baseline.use,baseURL:'http://127.0.0.1:4616'},webServer:{command:'npm run build && node tests/visit-sheet/serve.mjs',cwd:process.cwd(),env:{VISIT_AI_TEST:'1',VISIT_E2E_PORT:'4616',VISIT_E2E_DEV_PORT:'4617',VISIT_CONTROL_PORT:'4618',VISIT_SHUTDOWN_FILE:'../case-continuity/.shutdown-followup'},url:'http://127.0.0.1:4616/api/health',reuseExistingServer:false,timeout:60000}})

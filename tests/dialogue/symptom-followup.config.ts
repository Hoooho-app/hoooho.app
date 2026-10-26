import config from '../overview-approved/playwright.config'
import path from 'node:path'
import {mkdirSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
mkdirSync(path.resolve(import.meta.dirname,'../../.codex-tmp'),{recursive:true})
process.env.VISIT_SHUTDOWN_FILE=pathToFileURL(path.resolve(import.meta.dirname,'../../.codex-tmp/symptom-followup-shutdown')).href
export default {...config,testDir:import.meta.dirname,testMatch:'symptom-followup.spec.ts',outputDir:'../../outputs/symptom-followup',use:{...config.use,baseURL:'http://127.0.0.1:4256'},webServer:{...config.webServer,env:{VISIT_AI_TEST:'1',VISIT_BAILIAN_TEST:'1',AI_MAX_CALLS_PER_ACCOUNT_HOUR:'1000',VISIT_E2E_PORT:'4256',VISIT_E2E_DEV_PORT:'4257',VISIT_CONTROL_PORT:'4258'},url:'http://127.0.0.1:4256/api/health'}}

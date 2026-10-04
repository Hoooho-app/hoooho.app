import {defineConfig} from '@playwright/test'
import baseline from './followup.config'
// Independent background WebKit context; never changes the visible SE preview.
export default defineConfig({...baseline,testMatch:'followup.spec.ts',use:{...baseline.use,browserName:'webkit',channel:undefined,launchOptions:{}}})

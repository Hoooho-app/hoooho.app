import {defineConfig} from '@playwright/test'
import base from '../dialogue/playwright.config'
export default defineConfig({...base,testDir:'.',testMatch:'manual.spec.ts',globalTeardown:'../visit-sheet/teardown.mjs',outputDir:'../../test-results/symptom-manual',use:{...base.use,viewport:{width:375,height:667},trace:'retain-on-failure'}})

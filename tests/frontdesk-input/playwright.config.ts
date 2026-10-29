import {defineConfig} from '@playwright/test'
import base from '../dialogue/playwright.config'
export default defineConfig({...base,testDir:'.',testMatch:'input.spec.ts',outputDir:'../../outputs/frontdesk-input',use:{...base.use,screenshot:'only-on-failure',trace:'retain-on-failure'}})

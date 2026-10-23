import {defineConfig} from '@playwright/test'
import base from './playwright.config'
export default defineConfig({...base,testMatch:'forest.spec.ts',outputDir:'../../test-results/forest',use:{...base.use,actionTimeout:12000}})

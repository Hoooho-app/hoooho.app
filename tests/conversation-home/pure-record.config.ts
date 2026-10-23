import {defineConfig} from '@playwright/test'
import base from './playwright.config'
export default defineConfig({...base,testMatch:'pure-record.spec.ts',use:{...base.use,actionTimeout:8000},outputDir:'../../test-results/pure-record'})

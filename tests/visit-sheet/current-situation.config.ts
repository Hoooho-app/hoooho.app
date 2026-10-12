import {defineConfig} from '@playwright/test'
import base from './playwright.config'
export default defineConfig({...base,outputDir:'../../outputs/visit-current-situation/browser',testMatch:'current-situation.spec.ts',projects:base.projects?.filter(p=>['iphone-se','mobile-390','mobile-430'].includes(p.name!))})

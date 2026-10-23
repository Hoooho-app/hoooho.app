import { defineConfig } from '@playwright/test'
import base from '../dialogue/playwright.config'
export default defineConfig({...base,fullyParallel:false,workers:1,testDir:'.',testMatch:'home.spec.ts',outputDir:'../../test-results/conversation-home',use:{...base.use,launchOptions:{...base.use?.launchOptions,args:[...(base.use?.launchOptions?.args??[]),'--single-process','--no-zygote','--disable-gpu']}}})

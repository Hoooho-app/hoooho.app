import {defineConfig} from '@playwright/test'
import base from '../dialogue/playwright.config'
import ops from '../ops-workspace/playwright.config'
export default defineConfig({testDir:'.',workers:1,timeout:60000,expect:{timeout:12000},use:{serviceWorkers:'block',launchOptions:{args:['--no-sandbox']},trace:'retain-on-failure'},webServer:[base.webServer!,ops.webServer!],projects:[...[320,390,430].map(width=>({name:`banner-${width}`,testMatch:'banner.spec.ts',use:{baseURL:'http://127.0.0.1:4196',viewport:{width,height:844}}})),{name:'ops',testMatch:'ops.spec.ts',use:{baseURL:'http://127.0.0.1:4217',viewport:{width:1440,height:900}}}]})

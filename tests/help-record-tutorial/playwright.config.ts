import { defineConfig } from '@playwright/test'
import base from '../dialogue/playwright.config'
export default defineConfig({ ...base, testDir: '.', testMatch: 'tutorial.spec.ts', globalTeardown: '../visit-sheet/teardown.mjs', outputDir: '../../test-results/help-record-tutorial', use: { ...base.use, trace: 'retain-on-failure' } })

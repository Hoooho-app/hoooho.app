import { defineConfig } from '@playwright/test'
import base from '../dialogue/playwright.config'
export default defineConfig({ ...base, testDir: '.', testMatch: ['navigation.spec.ts', 'archive.spec.ts', 'sidebar-history.spec.ts'], fullyParallel: false, workers: 1, outputDir: '../../test-results/frontdesk-navigation', use: { ...base.use, launchOptions: { ...base.use?.launchOptions, args: [...(base.use?.launchOptions?.args ?? []), '--disable-dev-shm-usage'] } } })

import { defineConfig } from '@playwright/test'
import base from '../frontdesk-navigation/playwright.config'
export default defineConfig({ ...base, testDir: '.', testMatch: 'calendar.spec.ts', outputDir: '../../test-results/calendar-review-only' })

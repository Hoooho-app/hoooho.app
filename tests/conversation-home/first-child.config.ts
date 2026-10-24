import { defineConfig } from '@playwright/test'
import base from './playwright.config'
export default defineConfig({ ...base, testMatch: 'first-child.spec.ts', outputDir: '../../test-results/first-child-setup' })

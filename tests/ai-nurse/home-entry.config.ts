import { defineConfig } from '@playwright/test'
import config from './playwright.config'

export default defineConfig({
  ...config,
  testMatch: 'home-entry.spec.ts',
  outputDir: '../../test-results/home-nurse-entry',
  use: {
    ...config.use,
    timezoneId: 'Asia/Shanghai',
    launchOptions: process.env.HOOOHO_CHROMIUM_PATH
      ? { executablePath: process.env.HOOOHO_CHROMIUM_PATH } : {},
  },
})

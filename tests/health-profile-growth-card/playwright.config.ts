import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results/health-profile-growth-card',
  reporter: 'line',
  use: { ...devices['iPhone SE'], baseURL: 'http://127.0.0.1:3000', screenshot: 'only-on-failure' },
})

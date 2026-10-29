import { defineConfig } from '@playwright/test'
import base from '../dialogue/playwright.config'

export default defineConfig({ ...base, testDir: '.', testMatch: 'cutout.spec.ts',
  outputDir: '../../test-results/nurse-video-cutout',
  projects: [320, 390, 430].map(width => ({ name: `mobile-${width}`, use: { viewport: { width, height: 844 } } })),
})

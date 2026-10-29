import { defineConfig } from '@playwright/test'
import base from '../dialogue/playwright.config'

export default defineConfig({ ...base, testDir: '.',
  outputDir: '../../test-results/frontdesk-welcome',
  testMatch: ['welcome.spec.ts', 'mini.spec.ts'],
  projects: [
    ...[320, 390, 430].map(width => ({ name: `mobile-${width}`, testMatch: 'welcome.spec.ts', use: { viewport: { width, height: 844 } } })),
    ...[932, 844, 812, 724, 667, 646].map(height => ({ name: `mini-${height}`, testMatch: 'mini.spec.ts', use: { viewport: { width: 375, height } } })),
    { name: 'small-320', testMatch: 'mini.spec.ts', use: { viewport: { width: 320, height: 568 } } },
  ],
})

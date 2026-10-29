import { defineConfig } from '@playwright/test'
import base from '../dialogue/playwright.config'

export default defineConfig({ ...base, testDir: '.',
  outputDir: '../../test-results/frontdesk-welcome',
  testMatch: ['welcome.spec.ts', 'mini.spec.ts', 'banner.spec.ts', 'care.spec.ts'],
  projects: [
    { name: 'banner-flows', testMatch: 'banner.spec.ts', use: { viewport: { width: 375, height: 812 } } },
    ...[{ width: 320, height: 568 }, { width: 375, height: 646 }, { width: 375, height: 932 }, { width: 430, height: 932 }].map(size => ({ name: `banner-layout-${size.width}-${size.height}`, testMatch: 'banner.spec.ts', grep: /all three banners/, use: { viewport: size } })),
    ...[320, 390, 430].map(width => ({ name: `mobile-${width}`, testMatch: ['welcome.spec.ts', 'care.spec.ts'], use: { viewport: { width, height: 844 } } })),
    ...[932, 844, 812, 724, 667, 646, 568].map(height => ({ name: `mini-${height}`, testMatch: 'mini.spec.ts', use: { viewport: { width: 375, height } } })),
    { name: 'small-320', testMatch: 'mini.spec.ts', use: { viewport: { width: 320, height: 568 } } },
  ],
})

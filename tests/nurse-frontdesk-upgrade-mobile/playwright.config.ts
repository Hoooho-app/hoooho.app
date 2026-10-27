import {defineConfig} from '@playwright/test'
import current from '../front-desk-continuous/playwright.config'
// Preserve the established command with the current microphone and four widths.
export default defineConfig({...current,testDir:import.meta.dirname,outputDir:'../../test-results/nurse-frontdesk-upgrade-mobile'})

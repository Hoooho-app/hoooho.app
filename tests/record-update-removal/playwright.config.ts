import { defineConfig } from '@playwright/test'
import path from 'node:path'
import base from '../material-icons/page-states.config'

export default defineConfig({
  ...base, testDir: '.', testMatch: 'removal.spec.ts',
  outputDir: '../../test-results/record-update-removal',
  reporter: [['line'], ['json', { outputFile: path.resolve(import.meta.dirname, '../../test-results/record-update-removal/results.json') }]]
})

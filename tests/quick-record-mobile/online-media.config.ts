import { defineConfig } from '@playwright/test'
import base from './playwright.config'
if (!process.env.NURSE_BASE_URL) throw new Error('NURSE_BASE_URL must name the verified deployment')
export default defineConfig({
  ...base,
  testMatch: 'nurse-video.spec.ts',
  grep: /real frames|list switch|MP4 byte|deployed media/,
  use: { ...base.use, baseURL: process.env.NURSE_BASE_URL }
})

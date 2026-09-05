import { defineConfig } from '@playwright/test'
import base from './playwright.config'
export default defineConfig({
  ...base,
  testMatch: 'nurse-video.spec.ts',
  grep: /real frames|buffer threshold|ended frame|blocked autoplay|list switch|MP4 byte/,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4206', browserName: 'webkit', launchOptions: {} },
  webServer: { ...base.webServer, command: 'node serve.mjs', url: 'http://127.0.0.1:4206/api/health', env: { NURSE_TEST_PORT: '4206' } }
})

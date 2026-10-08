import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const about = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const viteConfig = readFileSync(new URL('../../../vite.config.ts', import.meta.url), 'utf8')

test('关于页从统一构建来源展示版本及应用内更新记录', () => {
  assert.match(viteConfig, /packageMetadata\.version/)
  assert.match(viteConfig, /VITE_APP_UPDATED_AT/)
  assert.match(about, /import\.meta\.env\.VITE_APP_VERSION/)
  assert.match(about, /import\.meta\.env\.VITE_APP_UPDATED_AT/)
  assert.match(about, /本次构建更新于/)
  assert.match(about, /更新记录/)
  assert.doesNotMatch(about, /github\.com|版本说明|logoUrl/)
  assert.doesNotMatch(about, /v1\.0\.0/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const about = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const viteConfig = readFileSync(new URL('../../../vite.config.ts', import.meta.url), 'utf8')

test('关于页从统一构建来源展示版本、更新时间和版本说明入口', () => {
  assert.match(viteConfig, /packageMetadata\.version/)
  assert.match(viteConfig, /VITE_APP_UPDATED_AT/)
  assert.match(about, /import\.meta\.env\.VITE_APP_VERSION/)
  assert.match(about, /import\.meta\.env\.VITE_APP_UPDATED_AT/)
  assert.match(about, /当前版本/)
  assert.match(about, /最近更新时间/)
  assert.match(about, />版本说明</)
  assert.doesNotMatch(about, /v1\.0\.0/)
})

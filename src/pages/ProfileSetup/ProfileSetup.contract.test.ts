import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')

test('首次添加家人页面使用精简标题和可选出生信息精度', () => {
  assert.match(pageSource, />添加第一个家人</)
  assert.equal(pageSource.includes('先添加第一个家人，'), false)
  assert.equal(pageSource.includes('无需上传照片。'), false)
  assert.match(pageSource, /\['year', '仅年份'\]/)
  assert.match(pageSource, /\['date', '完整日期'\]/)
  assert.match(pageSource, /autoComplete="bday-year"/)
  assert.match(pageSource, /autoComplete="bday"/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')

test('首次添加家人页面将出生信息精度合并到出生日期字段', () => {
  assert.match(pageSource, />添加第一个家人</)
  assert.equal(pageSource.includes('先添加第一个家人，'), false)
  assert.equal(pageSource.includes('无需上传照片。'), false)
  assert.equal(pageSource.includes('>出生信息精度</legend>'), false)
  assert.match(pageSource, /aria-label="出生日期精度"/)
  assert.match(pageSource, /htmlFor="profile-birthday"/)
  assert.match(pageSource, /id="profile-birthday"/)
  assert.match(pageSource, /\['year', '仅年份'\]/)
  assert.match(pageSource, /\['date', '完整日期'\]/)
  assert.match(pageSource, /autoComplete="bday-year"/)
  assert.match(pageSource, /autoComplete="bday"/)
})

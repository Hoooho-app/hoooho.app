import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')

test('首次添加家人页面将出生信息精度合并到出生日期字段', () => {
  assert.match(pageSource, /<WebPageHeader title="添加第一个家人" \/>/)
  assert.equal(pageSource.includes('<h1 className="hoho-text-page-title">添加第一个家人</h1>'), false)
  assert.equal(pageSource.includes('先添加第一个家人，'), false)
  assert.equal(pageSource.includes('无需上传照片。'), false)
  assert.equal(pageSource.includes('>出生信息精度</legend>'), false)
  assert.match(pageSource, /aria-label="出生日期精度"/)
  assert.match(pageSource, /overflow-hidden rounded-medium border border-border bg-surface/)
  assert.match(pageSource, /htmlFor="profile-birthday"/)
  assert.match(pageSource, /id="profile-birthday"/)
  assert.match(pageSource, /\['year', '仅年份'\]/)
  assert.match(pageSource, /\['date', '完整日期'\]/)
  assert.match(pageSource, /autoComplete="bday-year"/)
  assert.match(pageSource, /autoComplete="bday"/)
  assert.match(pageSource, /getBirthdayAgeMessage\(birthday, birthdayPrecision\)/)
  assert.match(pageSource, /<FamilyAvatarEditor\s+compact/)
  assert.equal(pageSource.includes('填写出生年份即可，系统将计算大致年龄'), false)
  assert.equal(pageSource.includes('placeholder="例如：1990"'), false)
})

test('首次添加家人允许跳过且使用路由替换进入兜底首页', () => {
  assert.match(pageSource, /跳过，稍后再添加/)
  assert.match(pageSource, /navigate\('\/health-events', \{ replace: true \}\)/)
})

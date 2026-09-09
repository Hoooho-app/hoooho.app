import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatChildAgeFromDateKeys,
  getChildBirthdayBounds,
  inferFamilyMemberRelationship,
  isChildProfileMember,
  validateChildBirthdayKey
} from '../../shared/child-profile-policy.mjs'

const today = '2026-09-03'

test('孩子生日按具体自然日限制为尚未满8周岁', () => {
  assert.deepEqual(getChildBirthdayBounds(today), { min: '2018-09-04', max: '2026-09-03' })
  assert.equal(validateChildBirthdayKey('2018-09-04', today).valid, true)
  assert.equal(validateChildBirthdayKey('2018-09-03', today).error, 'too-old')
  assert.equal(validateChildBirthdayKey('2026-09-04', today).error, 'future')
  assert.equal(validateChildBirthdayKey('2026-02-30', today).error, 'invalid')
  assert.equal(validateChildBirthdayKey('', today).valid, true)
})

test('闰日边界只禁用真正满8周岁的日期', () => {
  assert.deepEqual(getChildBirthdayBounds('2024-02-29'), { min: '2016-03-01', max: '2024-02-29' })
})

test('年龄始终按本地纯日期精确显示到日', () => {
  assert.equal(formatChildAgeFromDateKeys('2026-09-03', today), '0天')
  assert.equal(formatChildAgeFromDateKeys('2026-08-20', today), '14天')
  assert.equal(formatChildAgeFromDateKeys('2026-01-03', today), '8个月0天')
  assert.equal(formatChildAgeFromDateKeys('2023-05-12', today), '3岁3个月22天')
  assert.equal(formatChildAgeFromDateKeys('2023-09-03', today), '3岁0个月0天')
})

test('月末和闰日年龄使用真实日历周年日计算', () => {
  assert.equal(formatChildAgeFromDateKeys('2026-01-31', '2026-02-28'), '1个月0天')
  assert.equal(formatChildAgeFromDateKeys('2024-02-29', '2025-02-28'), '1岁0个月0天')
  assert.equal(formatChildAgeFromDateKeys('2024-02-29', '2025-03-01'), '1岁0个月1天')
})

test('儿童身份统一兼容显式 child 和历史 other 幼儿', () => {
  assert.equal(inferFamilyMemberRelationship('2026-09-03', today), 'child')
  assert.equal(inferFamilyMemberRelationship('1990-01-01', today), 'other')
  assert.equal(isChildProfileMember({ isSelf: false, relationship: 'child', birthday: '2010-01-01' }, today), true)
  assert.equal(isChildProfileMember({ isSelf: false, relationship: 'other', birthday: '2026-09-03' }, today), true)
  assert.equal(isChildProfileMember({ isSelf: false, relationship: 'other', birthday: '1990-01-01' }, today), false)
  assert.equal(isChildProfileMember({ isSelf: true, relationship: 'child', birthday: '2026-09-03' }, today), false)
})

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

test('年龄始终按本地纯日期显示月龄或岁月龄', () => {
  assert.equal(formatChildAgeFromDateKeys('2026-08-20', today), '未满1个月')
  assert.equal(formatChildAgeFromDateKeys('2026-01-03', today), '8个月')
  assert.equal(formatChildAgeFromDateKeys('2023-05-12', today), '3岁3个月')
  assert.equal(formatChildAgeFromDateKeys('2023-09-03', today), '3岁')
})

test('儿童身份统一兼容显式 child 和历史 other 幼儿', () => {
  assert.equal(inferFamilyMemberRelationship('2026-09-03', today), 'child')
  assert.equal(inferFamilyMemberRelationship('1990-01-01', today), 'other')
  assert.equal(isChildProfileMember({ isSelf: false, relationship: 'child', birthday: '2010-01-01' }, today), true)
  assert.equal(isChildProfileMember({ isSelf: false, relationship: 'other', birthday: '2026-09-03' }, today), true)
  assert.equal(isChildProfileMember({ isSelf: false, relationship: 'other', birthday: '1990-01-01' }, today), false)
  assert.equal(isChildProfileMember({ isSelf: true, relationship: 'child', birthday: '2026-09-03' }, today), false)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { ageInCompletedMonths, formatChildAgeAt, isChildUnderSeven } from './child-age.mjs'

test('child age uses completed calendar months across leap years', () => {
  assert.equal(ageInCompletedMonths('2024-02-29', '2025-02-28T23:59:59+08:00'), 11)
  assert.equal(ageInCompletedMonths('2024-02-29', '2025-03-01T00:00:00+08:00'), 12)
})

test('child age labels follow pediatric precision', () => {
  assert.equal(formatChildAgeAt('2026-08-15', '2026-09-03'), '未满1个月')
  assert.equal(formatChildAgeAt('2025-12-03', '2026-09-03'), '9个月')
  assert.equal(formatChildAgeAt('2024-01-03', '2026-09-03'), '2岁8个月')
  assert.equal(formatChildAgeAt('2022-01-03', '2026-09-03'), '4岁')
})

test('the seventh birthday is the exact read-only boundary', () => {
  assert.equal(isChildUnderSeven('2019-09-04', '2026-09-03T23:59:59+08:00'), true)
  assert.equal(isChildUnderSeven('2019-09-03', '2026-09-03T00:00:00+08:00'), false)
})

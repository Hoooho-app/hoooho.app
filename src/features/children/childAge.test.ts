import assert from 'node:assert/strict'
import test from 'node:test'
import { canChildCreateRecords, childAgeInMonths, formatChildAge } from './childAge'

test('formats child age at pediatric precision', () => {
  assert.equal(formatChildAge('2025-12-03', new Date(2026, 8, 3)), '9个月')
  assert.equal(formatChildAge('2024-01-03', new Date(2026, 8, 3)), '2岁8个月')
  assert.equal(formatChildAge('2022-01-03', new Date(2026, 8, 3)), '4岁')
})

test('preserves the exact seventh birthday boundary', () => {
  assert.equal(childAgeInMonths('2019-09-04', new Date(2026, 8, 3)), 83)
  assert.equal(canChildCreateRecords('2019-09-04', new Date(2026, 8, 3)), true)
  assert.equal(canChildCreateRecords('2019-09-03', new Date(2026, 8, 3)), false)
})

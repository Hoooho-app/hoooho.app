import assert from 'node:assert/strict'
import test from 'node:test'
import { formatAgeFromBirthday } from './formatAgeFromBirthday.ts'

test('age formatting supports a birthday recorded to year precision', () => {
  const today = new Date('2026-08-12T12:00:00+08:00')

  assert.equal(formatAgeFromBirthday('1990', today), '36岁')
})

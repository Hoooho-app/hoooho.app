import assert from 'node:assert/strict'
import test from 'node:test'
import { familyBirthdayErrorMessage, getFamilyBirthdayBounds, validateFamilyBirthday } from './familyBirthday'

const today = new Date(2026, 7, 31, 23, 30)

test('family birthday accepts an empty date and the inclusive 120-year range', () => {
  assert.deepEqual(getFamilyBirthdayBounds(today), { min: '1906-08-31', max: '2026-08-31' })
  assert.equal(validateFamilyBirthday('', today).valid, true)
  assert.equal(validateFamilyBirthday('1906-08-31', today).valid, true)
  assert.equal(validateFamilyBirthday('2026-08-31', today).valid, true)
})

test('family birthday rejects impossible, future, and over-120 dates without timezone parsing', () => {
  assert.equal(validateFamilyBirthday('2026-02-30', today).error, 'invalid')
  assert.equal(validateFamilyBirthday('2026-09-01', today).error, 'future')
  assert.equal(validateFamilyBirthday('1906-08-30', today).error, 'too-old')
  assert.equal(familyBirthdayErrorMessage('future'), '出生日期不能晚于今天')
})

test('leap-day bounds stay on a real calendar date', () => {
  const leapToday = new Date(2024, 1, 29, 12)
  assert.deepEqual(getFamilyBirthdayBounds(leapToday), { min: '1904-02-28', max: '2024-02-29' })
})

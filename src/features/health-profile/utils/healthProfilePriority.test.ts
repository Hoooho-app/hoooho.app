import assert from 'node:assert/strict'
import test from 'node:test'
import { healthProfileSections } from '../config/healthProfileSections.ts'
import { healthProfilePriorities } from '../config/healthProfileTemplates.ts'
import { getHealthProfileType } from './getHealthProfileProfile.ts'

const today = new Date('2026-08-12T12:00:00+08:00')

test('health profile priorities change with age and gender', () => {
  assert.equal(getHealthProfileType('2026-01-01', 'male', today), 'infant')
  assert.equal(getHealthProfileType('2018-01-01', 'female', today), 'child')
  assert.equal(getHealthProfileType('2010-01-01', 'female', today), 'teen')
  assert.equal(getHealthProfileType('1992-01-01', 'female', today), 'adult-female')
  assert.equal(getHealthProfileType('1958-01-01', 'male', today), 'elder-male')
})

test('priority sections match the frozen profile rules and keep a complete catalog', () => {
  assert.deepEqual(healthProfilePriorities.infant, ['growth', 'feeding', 'allergy', 'vaccination', 'birth'])
  assert.deepEqual(healthProfilePriorities['adult-female'], ['basic', 'history', 'medication', 'examination', 'menstrual'])
  assert.deepEqual(healthProfilePriorities['elder-male'], ['history', 'medication', 'indicators', 'examination', 'care'])
  assert.equal(healthProfileSections.length, 14)
  assert.equal(new Set(healthProfileSections.map(({ id }) => id)).size, 14)
})

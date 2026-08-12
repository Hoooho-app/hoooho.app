import assert from 'node:assert/strict'
import test from 'node:test'
import { healthProfileSections } from '../config/healthProfileSections.ts'
import { healthProfilePriorities } from '../config/healthProfileTemplates.ts'
import { getHealthProfileType } from './getHealthProfileProfile.ts'
import { getHealthProfileSectionGroups } from './getHealthProfileSectionGroups.ts'

const today = new Date('2026-08-12T12:00:00+08:00')

test('health profile priorities change with age and gender', () => {
  assert.equal(getHealthProfileType('2026-01-01', 'male', today), 'infant')
  assert.equal(getHealthProfileType('2018-01-01', 'female', today), 'child')
  assert.equal(getHealthProfileType('2010-01-01', 'female', today), 'teen')
  assert.equal(getHealthProfileType('1992-01-01', 'female', today), 'adult-female')
  assert.equal(getHealthProfileType('1958-01-01', 'male', today), 'elder-male')
})

test('adult male hides menstrual health and has no duplicate sections', () => {
  const groups = getHealthProfileSectionGroups('adult-male', new Set())
  const visibleIds = [...groups.priorities, ...groups.secondary, ...groups.historical].map(({ id }) => id)
  assert.equal(visibleIds.includes('menstrual'), false)
  assert.equal(new Set(visibleIds).size, visibleIds.length)
  assert.equal(groups.priorities.some(({ id }) => groups.secondary.some((section) => section.id === id)), false)
  assert.deepEqual(groups.secondary.map(({ id }) => id).filter((id) => ['allergy', 'family-history', 'vaccination', 'sleep'].includes(id)), ['allergy', 'family-history', 'vaccination', 'sleep'])
})

test('adult female keeps menstrual health applicable', () => {
  const groups = getHealthProfileSectionGroups('adult-female', new Set())
  assert.equal(groups.priorities.some(({ id }) => id === 'menstrual'), true)
})

test('historical sections require real data', () => {
  const withoutData = getHealthProfileSectionGroups('adult-male', new Set())
  assert.deepEqual(withoutData.historical, [])
  const withData = getHealthProfileSectionGroups('adult-male', new Set(['growth', 'feeding', 'birth']))
  assert.deepEqual(withData.historical.map(({ id }) => id), ['growth', 'feeding', 'birth'])
})

test('infant feeding stays active while adult feeding without data stays hidden', () => {
  const infant = getHealthProfileSectionGroups('infant', new Set())
  assert.equal(infant.priorities.some(({ id }) => id === 'feeding'), true)
  const adult = getHealthProfileSectionGroups('adult-male', new Set())
  assert.equal([...adult.priorities, ...adult.secondary, ...adult.historical].some(({ id }) => id === 'feeding'), false)
})

test('priority sections match the frozen profile rules and keep a complete catalog', () => {
  assert.deepEqual(healthProfilePriorities.infant, ['growth', 'feeding', 'allergy', 'vaccination', 'birth'])
  assert.deepEqual(healthProfilePriorities['adult-female'], ['basic', 'history', 'medication', 'examination', 'menstrual'])
  assert.deepEqual(healthProfilePriorities['elder-male'], ['history', 'medication', 'indicators', 'examination', 'care'])
  assert.equal(healthProfileSections.length, 14)
  assert.equal(new Set(healthProfileSections.map(({ id }) => id)).size, 14)
})

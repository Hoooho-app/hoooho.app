import assert from 'node:assert/strict'
import test from 'node:test'
import { healthProfileSections } from '../config/healthProfileSections.ts'
import { healthProfilePriorities } from '../config/healthProfileTemplates.ts'
import { getHealthProfileType } from './getHealthProfileProfile.ts'
import { buildHealthProfileHomeGroups, latestStoredSections } from './healthProfileHomeLogic.ts'

const today = new Date('2026-08-12T12:00:00+08:00')

test('health profile priorities change with age and gender', () => {
  assert.equal(getHealthProfileType('2026-01-01', 'male', today), 'infant')
  assert.equal(getHealthProfileType('2018-01-01', 'female', today), 'child')
  assert.equal(getHealthProfileType('2010-01-01', 'female', today), 'teen')
  assert.equal(getHealthProfileType('1992-01-01', 'female', today), 'adult-female')
  assert.equal(getHealthProfileType('1958-01-01', 'male', today), 'elder-male')
})

test('catalog contains 26 unique top-level sections', () => {
  assert.equal(healthProfileSections.length, 26)
  assert.equal(new Set(healthProfileSections.map(({ id }) => id)).size, 26)
})

test('recorded sections are pinned and sorted by latest update', () => {
  const groups = buildHealthProfileHomeGroups(healthProfileSections, healthProfilePriorities['adult-male'], [
    { id: 'allergy', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'medication', updatedAt: '2026-08-01T00:00:00Z' }
  ])
  assert.deepEqual(groups.recorded.map(({ id }) => id), ['medication', 'allergy'])
  assert.equal(groups.suggested.some(({ id }) => id === 'allergy' || id === 'medication'), false)
})

test('recommendations respect life stage and gender', () => {
  assert.deepEqual(healthProfilePriorities.infant.slice(0, 6), ['basic','feeding','growth','allergy','vaccination','birth'])
  assert.equal(healthProfilePriorities['adult-male'].includes('feeding'), false)
  assert.equal(healthProfilePriorities.child.includes('smoking'), false)
  assert.equal(healthProfilePriorities['adult-female'].includes('menstrual'), true)
  assert.equal(healthProfilePriorities['elder-male'].includes('mobility'), true)
  assert.equal(healthProfilePriorities['elder-male'].includes('fall'), true)
})

test('stored records retain latest update per member section', () => {
  const data = new Map([
    ['hoho-health-profile:m1:allergy', JSON.stringify([{ _savedAt: '2026-01-01' }, { _savedAt: '2026-08-01' }])],
    ['hoho-health-profile:m1:medication', JSON.stringify([{ _savedAt: '2026-06-01' }])]
  ])
  const stored = latestStoredSections(healthProfileSections.map(({ id }) => id), 'm1', { getItem: (key) => data.get(key) ?? null })
  assert.deepEqual(stored.slice(0, 2), [
    { id: 'allergy', updatedAt: '2026-08-01' },
    { id: 'medication', updatedAt: '2026-06-01' }
  ])
})

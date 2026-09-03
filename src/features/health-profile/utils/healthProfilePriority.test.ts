import assert from 'node:assert/strict'
import test from 'node:test'
import { healthProfileSections } from '../config/healthProfileSections.ts'
import { healthProfilePriorities } from '../config/healthProfileTemplates.ts'
import { getHealthProfileType } from './getHealthProfileProfile.ts'
import { buildHealthProfileHomeGroups, buildPersonalizedHealthDirectory, latestStoredSections, readStoredSectionSnapshots } from './healthProfileHomeLogic.ts'

const today = new Date('2026-08-12T12:00:00+08:00')

test('health profile priorities change with age and gender', () => {
  assert.equal(getHealthProfileType('2026-01-01', 'male', today), 'infant')
  assert.equal(getHealthProfileType('2018-01-01', 'female', today), 'child')
  assert.equal(getHealthProfileType('2010-01-01', 'female', today), 'teen')
  assert.equal(getHealthProfileType('1992-01-01', 'female', today), 'adult-female')
  assert.equal(getHealthProfileType('1958-01-01', 'male', today), 'elder-male')
})

const childProfileSections = ['birth','growth','allergy','medication','chronic','hospitalization','family-history']

test('catalog contains exactly seven child-health sections', () => {
  assert.deepEqual(healthProfileSections.map(({ id }) => id), childProfileSections)
  assert.equal(new Set(healthProfileSections.map(({ id }) => id)).size, 7)
})

test('recorded sections are pinned and sorted by latest update', () => {
  const groups = buildHealthProfileHomeGroups(healthProfileSections, healthProfilePriorities['adult-male'], [
    { id: 'allergy', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'medication', updatedAt: '2026-08-01T00:00:00Z' }
  ])
  assert.deepEqual(groups.recorded.map(({ id }) => id), ['medication', 'allergy'])
  assert.equal(groups.suggested.some(({ id }) => id === 'allergy' || id === 'medication'), false)
})

test('every legacy profile type resolves to the same child-health directory', () => {
  for (const priorities of Object.values(healthProfilePriorities)) assert.deepEqual(priorities, childProfileSections)
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

test('health profile snapshots read each section once and can be reused by summaries', () => {
  const data = new Map([
    ['hoho-health-profile:m1:birth', JSON.stringify([{ gestationalWeeks: 38, _savedAt: '2026-08-01' }])],
    ['hoho-health-profile:m1:allergy', JSON.stringify([{ allergen: '猫毛', _savedAt: '2026-08-02' }])]
  ])
  let reads = 0
  const snapshots = readStoredSectionSnapshots(healthProfileSections.map(({ id }) => id), 'm1', {
    getItem: (key) => {
      reads += 1
      return data.get(key) ?? null
    }
  })

  assert.equal(reads, healthProfileSections.length)
  assert.deepEqual(snapshots.map(({ id }) => id), ['allergy', 'birth'])
  assert.equal(snapshots.find(({ id }) => id === 'birth')?.records[0]?.gestationalWeeks, 38)
})

test('personalized directory contains only the seven pediatric sections without duplicates', () => {
  const recordedIds = new Set<string>()
  const adultMale = buildPersonalizedHealthDirectory(healthProfileSections, 'adult-male', healthProfilePriorities['adult-male'], recordedIds)
  assert.deepEqual(adultMale.priority.map(({ id }) => id), childProfileSections)
  assert.equal(new Set([...adultMale.priority, ...adultMale.remaining].map(({ id }) => id)).size, adultMale.visible.length)

  const child = buildPersonalizedHealthDirectory(healthProfileSections, 'child', healthProfilePriorities.child, recordedIds)
  assert.equal(child.priority[1]?.id, 'growth')
  assert.equal(child.priority.length, 7)

  const elderFemale = buildPersonalizedHealthDirectory(healthProfileSections, 'elder-female', healthProfilePriorities['elder-female'], recordedIds)
  assert.deepEqual(elderFemale.priority.map(({ id }) => id), childProfileSections)
})

test('legacy adult profile labels cannot reintroduce adult-only sections', () => {
  const directory = buildPersonalizedHealthDirectory(
    healthProfileSections,
    'adult-female',
    healthProfilePriorities['adult-female'],
    new Set<string>()
  )

  assert.deepEqual(directory.priority.map(({ id }) => id), childProfileSections)
  assert.equal(directory.remaining.length, 0)
  assert.equal(directory.visible.some(({ id }) => ['menstrual', 'pregnancy', 'mobility', 'fall'].includes(id)), false)
})

test('search and filled status use title, description and field labels', () => {
  const recordedIds = new Set<string>(['medication'])
  const searched = buildPersonalizedHealthDirectory(healthProfileSections, 'adult-female', healthProfilePriorities['adult-female'], recordedIds, '长期', 'all')
  assert.equal(searched.visible.some(({ id }) => id === 'medication'), true)
  assert.equal(searched.visible.some(({ id }) => id === 'chronic'), true)
  const filled = buildPersonalizedHealthDirectory(healthProfileSections, 'adult-female', healthProfilePriorities['adult-female'], recordedIds, '', 'filled')
  assert.deepEqual(filled.visible.map(({ id }) => id), ['medication'])
})

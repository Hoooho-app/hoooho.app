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
  assert.deepEqual(healthProfilePriorities.infant.slice(0, 6), ['basic','growth','feeding','allergy','vaccination','birth'])
  assert.equal(healthProfilePriorities['adult-male'].includes('feeding'), false)
  assert.equal(healthProfilePriorities.child.includes('smoking'), false)
  assert.deepEqual(healthProfilePriorities['adult-female'], ['basic','medication','allergy','chronic','surgery','family-history'])
  assert.equal(healthProfilePriorities['adult-female'].includes('menstrual'), false)
  assert.equal(healthProfilePriorities['adult-female'].includes('examination'), false)
  assert.equal(healthProfilePriorities['elder-male'].includes('mobility'), true)
  assert.equal(healthProfilePriorities['elder-male'].includes('fall'), true)
  assert.deepEqual(healthProfilePriorities['elder-male'].slice(0, 3), ['basic', 'mobility', 'fall'])
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
    ['hoho-health-profile:m1:basic', JSON.stringify([{ heightCm: 168, _savedAt: '2026-08-01' }])],
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
  assert.deepEqual(snapshots.map(({ id }) => id), ['allergy', 'basic'])
  assert.equal(snapshots.find(({ id }) => id === 'basic')?.records[0]?.heightCm, 168)
})

test('personalized directory hides inapplicable items and never duplicates priority items', () => {
  const recordedIds = new Set<string>()
  const adultMale = buildPersonalizedHealthDirectory(healthProfileSections, 'adult-male', healthProfilePriorities['adult-male'], recordedIds)
  assert.equal(adultMale.visible.some(({ id }) => id === 'menstrual' || id === 'pregnancy'), false)
  assert.deepEqual(adultMale.priority.map(({ id }) => id), ['basic','medication','allergy','chronic','surgery','family-history'])
  assert.equal(new Set([...adultMale.priority, ...adultMale.remaining].map(({ id }) => id)).size, adultMale.visible.length)

  const child = buildPersonalizedHealthDirectory(healthProfileSections, 'child', healthProfilePriorities.child, recordedIds)
  assert.equal(child.priority[1]?.id, 'growth')
  assert.equal(child.priority.length, 6)
  assert.equal(child.visible.some(({ id }) => id === 'smoking' || id === 'alcohol'), false)

  const elderFemale = buildPersonalizedHealthDirectory(healthProfileSections, 'elder-female', healthProfilePriorities['elder-female'], recordedIds)
  assert.equal(elderFemale.visible.some(({ id }) => id === 'menstrual' || id === 'pregnancy'), false)
})

test('adult female keeps six priority items and groups moved items in their target sections', () => {
  const directory = buildPersonalizedHealthDirectory(
    healthProfileSections,
    'adult-female',
    healthProfilePriorities['adult-female'],
    new Set<string>()
  )

  assert.deepEqual(directory.priority.map(({ id }) => id), ['basic','medication','allergy','chronic','surgery','family-history'])
  assert.equal(directory.remaining.find(({ id }) => id === 'menstrual')?.category, 'female')
  assert.equal(directory.remaining.find(({ id }) => id === 'examination')?.category, 'long-term')
})

test('search and filled status use title, description and field labels', () => {
  const recordedIds = new Set<string>(['medication'])
  const searched = buildPersonalizedHealthDirectory(healthProfileSections, 'adult-female', healthProfilePriorities['adult-female'], recordedIds, '药物', 'all')
  assert.equal(searched.visible.some(({ id }) => id === 'medication'), true)
  assert.equal(searched.visible.some(({ id }) => id === 'allergy'), true)
  const filled = buildPersonalizedHealthDirectory(healthProfileSections, 'adult-female', healthProfilePriorities['adult-female'], recordedIds, '', 'filled')
  assert.deepEqual(filled.visible.map(({ id }) => id), ['medication'])
})

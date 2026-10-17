import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReview, reviewRange, timeLabel, type ReviewSources } from './reviewModel.ts'
import type { HealthEventApiDto, HealthEventRecordApiDto } from '../../types/index.ts'
const now = new Date('2026-10-17T10:00:00Z')
const event = (id: string, memberId = 'child'): HealthEventApiDto => ({ id, memberId, accountId: 'parent', title: id, category: 'other', status: 'observing', startTime: '2026-10-10T12:00:00Z', createdAt: '2026-10-10T12:00:00Z', updatedAt: '2026-10-10T12:00:00Z' })
const record = (id: string, eventId = id, journal: HealthEventRecordApiDto['journal'] = {}): HealthEventRecordApiDto => ({ id, eventId, accountId: 'parent', type: 'note', content: id, occurredAt: '2026-10-10T12:00:00Z', createdAt: '2026-10-10T12:00:00Z', updatedAt: '2026-10-10T12:00:00Z', journal })
const data = (): ReviewSources => ({ index: { events: [], records: [], attachments: [] }, profiles: [], cases: { active: [], archived: [], timezone: 'Asia/Shanghai', today: '2026-10-17' }, reminders: [] })
const build = (d: ReviewSources) => buildReview(d, 'child', '2026-10-01', '2026-10-17', now)
test('calendar ranges respect China date and leap years', () => {
  assert.deepEqual(reviewRange('7', now), { start: '2026-10-11', end: '2026-10-17' })
  assert.deepEqual(reviewRange('180', now), { start: '2026-04-18', end: '2026-10-17' })
  assert.deepEqual(reviewRange('365', new Date('2024-02-29T10:00:00Z')), { start: '2023-03-01', end: '2024-02-29' })
  assert.equal(timeLabel(24.5), '00:30')
})
test('merged symptoms and event updates count once; unknown dates and not-observed results do not count', () => {
  const d = data(); d.index.events = [event('a'), event('b'), event('unknown'), event('negative'), event('foreign', 'other')]
  const a = record('a', 'a', { categories: ['symptom'] })
  d.index.records = [a, { ...a, id: 'update', note: 'event-update:a' }, record('b', 'b', { categories: ['symptom'] }), { ...record('unknown', 'unknown', { categories: ['symptom'] }), caseContext: { timeUnknown: true } }, { ...record('negative', 'negative', { categories: ['symptom'] }), caseContext: { result: 'not_observed' } }, record('foreign', 'foreign', { categories: ['symptom'] })]
  d.cases.active = [{ event: event('a'), sourceEventIds: ['a', 'b'] } as ReviewSources['cases']['active'][number]]
  assert.equal(build(d).symptoms.length, 1); assert.equal(build(d).unknownSymptoms, 1)
})
test('allergy uses actual dated reactions, enforces ownership and deduplicates linked records', () => {
  const d = data(); d.index.events = [event('e')]; d.index.records = [record('r', 'e'), { ...record('foreign', 'e'), accountId: 'other' }]
  const reaction = { id: 'one', occurredAt: '2026-10-10T12:00:00Z', linkedHealthRecordId: 'r', symptoms: '皮疹' }
  d.profiles = [{ memberId: 'child', sectionId: 'allergy', records: [{ _allergyArchive: { items: [{ id: 'pending', name: '牛奶', currentStatus: 'investigating', reactions: [reaction] }, { id: 'sure', name: '花生', currentStatus: 'confirmed', reactions: [reaction, { ...reaction, id: 'foreign', linkedHealthRecordId: 'foreign' }, { id: 'missing-time', symptoms: '痒' }, { ...reaction, id: 'deleted', active: false }, { ...reaction, id: 'wrong-child', memberId: 'other', linkedHealthRecordId: undefined }] }] } }] }]
  const m = build(d); assert.equal(m.allergy[0].rows.length, 1); assert.equal(m.allergy[1].rows.length, 0); assert.equal(m.allergy[0].rows[0].eventId, 'e')
})
test('sleep gaps stay null, milk excludes duration and active feeding, incomplete sleep is excluded', () => {
  const d = data(); d.index.events = ['sleep', 'active', 'bottle', 'breast', 'feeding'].map(id => event(id))
  d.index.records = [record('sleep', 'sleep', { sleep: { kind: 'night', status: 'completed', sleepAt: '2026-10-10T13:00:00Z', wakeAt: '2026-10-10T23:00:00Z', durationMinutes: 600, timeZone: 'invalid' } }), record('active', 'active', { sleep: { kind: 'night', status: 'ongoing', sleepAt: '2026-10-10T13:00:00Z', wakeAt: '', durationMinutes: 0 } }), record('bottle', 'bottle', { diet: { kind: 'feeding', bottleMl: 180 } }), record('breast', 'breast', { diet: { kind: 'feeding', feedingMethod: 'breast', breastSeconds: { left: 300, right: 0, total: 300 } } }), record('feeding', 'feeding', { diet: { kind: 'feeding', bottleMl: 200, status: 'ongoing' } })]
  const m = build(d); assert.equal(m.sleepRows.length, 1); assert.equal(m.sleepDuration.find(b => b.rows.length)?.value, 10); assert.equal(m.bedtime.find(b => b.rows.length)?.value, 21); assert.equal(m.sleepDuration[0].value, null); assert.equal(m.milkTotal, 180)
})
test('medication denominator excludes future, archived cutoff, another child, and undone completion', () => {
  const d = data(), r = { id: 'med', memberId: 'child', plan: { medicationName: '已设置药品' }, archivedAt: '2026-10-12T00:00:00Z', occurrences: [{ id: 'done', scheduledAt: '2026-10-10T00:00:00Z', completed: true, completion: { eventId: 'e', recordId: 'r', undoneAt: null } }, { id: 'undone', scheduledAt: '2026-10-11T00:00:00Z', completed: true, completion: { undoneAt: '2026-10-11T01:00:00Z' } }, { id: 'archived', scheduledAt: '2026-10-13T00:00:00Z' }, { id: 'future', scheduledAt: '2026-10-17T20:00:00Z' }] } as ReviewSources['reminders'][number]
  d.reminders = [r, { ...r, id: 'other', memberId: 'other' }]; const m = build(d); assert.equal(m.medicationTotal, 2); assert.equal(m.medicationDone.length, 1); assert.equal(m.medicationPercent, 50)
})

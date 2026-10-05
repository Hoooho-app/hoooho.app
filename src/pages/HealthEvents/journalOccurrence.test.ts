import assert from 'node:assert/strict'
import test from 'node:test'
import { compactDuration, journalOccurrenceAt } from '../../../shared/journal-occurrence.mjs'
import { entriesForDay } from './timeGridModel'
import { journalListSummary, flattenJournal, type JournalEntry } from './timeViewModel'

const base: JournalEntry = { id: 'one', eventId: 'event', content: '晚奶', occurredAt: '2026-09-30T20:30:00+08:00', createdAt: '2026-09-30T21:10:00+08:00', attachmentCount: 0, status: 'observing', categories: ['diet'] }
test('ongoing feeding stays at start indefinitely, complete moves the same identity to end', () => {
  const running = { ...base, diet: { kind: 'feeding' as const, name: '晚奶', startedAt: base.occurredAt, status: 'ongoing' as const } }
  assert.equal(journalOccurrenceAt(running, 'wrong'), base.occurredAt)
  assert.equal(journalListSummary(running), '晚奶 · 持续中')
  assert.deepEqual(entriesForDay([running], '2026-10-01', new Date('2026-10-01T12:00:00+08:00')), [])
  const complete = { ...running, diet: { ...running.diet, status: 'completed' as const, endedAt: '2026-09-30T21:00:00+08:00', bottleMl: 180 } }
  assert.equal(journalListSummary(complete), '晚奶 · 共30分钟')
  assert.equal(journalOccurrenceAt(complete, 'wrong'), complete.diet.endedAt)
  assert.deepEqual(entriesForDay([complete], '2026-09-30').map(entry => entry.id), ['one'])
})
test('cross-midnight completed sleep occurs only at the end and planned wake cannot complete it', () => {
  const sleep = { sleepAt: '2026-09-30T21:10:00+08:00', wakeAt: '2026-10-01T06:00:00+08:00', status: 'ongoing' as const, durationMinutes: 530, kind: 'night' as const }
  const running = { ...base, sleep, categories: ['sleep'] as const }
  assert.equal(journalOccurrenceAt(running, ''), sleep.sleepAt)
  assert.equal(journalListSummary(running), '睡眠 · 持续中')
  const complete = { ...running, sleep: { ...sleep, status: 'completed' as const } }
  assert.deepEqual(entriesForDay([complete], '2026-09-30'), [])
  assert.deepEqual(entriesForDay([complete], '2026-10-01').map(entry => entry.id), ['one'])
  assert.equal(journalListSummary(complete), '睡眠 · 已醒 · 约9小时')
})
test('missing duration stays absent and never derives from milk volume or a plan', () => {
  const point = { ...base, diet: { kind: 'feeding' as const, name: '晚奶', bottleMl: 180 } }
  assert.equal(journalListSummary(point), '晚奶 · 180mL')
  assert.equal(journalListSummary({ ...point, diet: { kind: 'feeding', name: '晚奶' } }), '晚奶')
  assert.equal(compactDuration(0), ''); assert.equal(compactDuration(NaN), '')
  assert.equal(compactDuration(30), '30分钟'); assert.equal(compactDuration(530), '约9小时')
})
test('legacy stored start timestamp is projected to actual end without rewriting data or duplicating it', () => {
  const record: any = { ...base, accountId: 'a', type: 'note', journal: { categories: ['diet'], diet: { kind: 'meal', name: '晚奶', startedAt: base.occurredAt, endedAt: '2026-09-30T21:00:00+08:00' } } }
  const event: any = { id: 'event', accountId: 'a', memberId: 'child', status: 'observing' }
  const entries = flattenJournal([event], new Map([['event', [record]]]), new Map(), 'child')
  assert.equal(entries.length, 1); assert.equal(entries[0].occurredAt, record.journal.diet.endedAt)
  assert.equal(record.occurredAt, base.occurredAt)
})

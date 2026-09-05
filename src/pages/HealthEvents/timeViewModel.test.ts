import assert from 'node:assert/strict'
import test from 'node:test'
import { flattenJournal, journalDayGroups, journalTime, shiftJournalDate, type JournalEntry } from './timeViewModel.ts'
import type { HealthEventApiDto, HealthEventRecordApiDto } from '../../types/index.ts'

const entry = (id: string, time: string): JournalEntry => ({ id, eventId: 'event', content: id, occurredAt: time, createdAt: '2026-09-05T23:59:00', timePrecision: 'exact', categories: ['other'], attachmentCount: 0 })
test('one hour contains multiple peer records in occurrence order, regardless of submission date', () => {
  const a = entry('a', '2026-09-05T09:10:00')
  const b = { ...entry('b', '2026-09-05T09:45:00'), createdAt: '2026-09-05T09:45:01' }
  const groups = journalDayGroups([a, b, entry('old', '2026-09-04T21:00:00')], '2026-09-05')
  assert.equal(groups.length, 1)
  assert.equal(groups[0].label, '9时')
  assert.deepEqual(groups[0].items.map((item) => item.id), ['b', 'a'])
})
test('periods and unknown times do not render a fabricated exact time', () => {
  assert.deepEqual(journalTime({ ...entry('a', '2026-09-05T18:00:00'), timePrecision: 'period', timeLabel: '晚上' }), { group: '晚上', label: '晚上' })
  assert.equal(journalTime({ ...entry('b', '2026-09-05T23:59:00'), timePrecision: 'unknown' }).label, '时间未明确')
})
test('member and account scope is enforced and legacy event-only data is retained', () => {
  const event: HealthEventApiDto = { id: 'event', memberId: 'child', accountId: 'account', title: '原始内容', category: 'other', status: 'observing', startTime: '2026-09-05T09:00:00', createdAt: '2026-09-05T09:01:00', updatedAt: '2026-09-05T09:01:00' }
  const raw: HealthEventRecordApiDto = { id: 'record', accountId: 'account', eventId: 'event', type: 'note', content: '吃饭和游泳', occurredAt: event.startTime, createdAt: event.createdAt, updatedAt: event.updatedAt }
  const projected = flattenJournal([event, { ...event, id: 'other', memberId: 'another-child' }], new Map([['event', [raw, { ...raw, id: 'foreign', accountId: 'foreign' }]]]), new Map(), 'child')
  assert.equal(projected.length, 1)
  assert.equal(projected[0].content, raw.content)
  assert.deepEqual(projected[0].categories, ['other'])
  assert.equal(projected[0].timePrecision, 'unknown')
  assert.equal(flattenJournal([event], new Map(), new Map(), 'child')[0].content, event.title)
  assert.equal(flattenJournal([event], new Map(), new Map(), 'another-child').length, 0)
})
test('calendar navigation crosses months and leap days without adding 24-hour instants', () => {
  assert.equal(shiftJournalDate('2026-01-01', -1), '2025-12-31')
  assert.equal(shiftJournalDate('2024-03-01', -1), '2024-02-29')
})

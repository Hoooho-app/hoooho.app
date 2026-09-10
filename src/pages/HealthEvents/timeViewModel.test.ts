import assert from 'node:assert/strict'
import test from 'node:test'
import { bowelOccurrenceNumber, flattenJournal, journalDayGroups, journalListSummary, journalTime, journalUpdateLabel, shiftJournalDate, type JournalEntry } from './timeViewModel.ts'
import type { HealthEventApiDto, HealthEventRecordApiDto } from '../../types/index.ts'

const entry = (id: string, time: string): JournalEntry => ({ id, eventId: 'event', content: id, occurredAt: time, createdAt: '2026-09-05T23:59:00', timePrecision: 'exact', categories: ['other'], attachmentCount: 0, status: 'observing' })
test('one hour contains multiple peer records in occurrence order, regardless of submission date', () => {
  const a = entry('a', '2026-09-05T09:10:00')
  const b = { ...entry('b', '2026-09-05T09:45:00'), createdAt: '2026-09-05T09:45:01' }
  const groups = journalDayGroups([a, b, entry('old', '2026-09-04T21:00:00')], '2026-09-05')
  assert.equal(groups.length, 1)
  assert.equal(groups[0].label, '9时')
  assert.deepEqual(groups[0].items.map((item) => item.id), ['b', 'a'])
  assert.deepEqual(journalDayGroups([a, b], '2026-09-05', 'asc')[0].items.map((item) => item.id), ['a', 'b'])
})
test('periods keep their label while unresolved legacy text falls back to its recorded minute', () => {
  assert.deepEqual(journalTime({ ...entry('a', '2026-09-05T18:00:00'), timePrecision: 'period', timeLabel: '晚上' }), { group: '晚上', label: '晚上' })
  assert.equal(journalTime({ ...entry('b', '2026-09-05T23:59:00'), timePrecision: 'unknown' }).label, '23:59')
})
test('member and account scope is enforced and legacy event-only data is retained', () => {
  const event: HealthEventApiDto = { id: 'event', memberId: 'child', accountId: 'account', title: '原始内容', category: 'other', status: 'observing', startTime: '2026-09-05T09:00:00', createdAt: '2026-09-05T09:01:00', updatedAt: '2026-09-05T09:01:00' }
  const raw: HealthEventRecordApiDto = { id: 'record', accountId: 'account', eventId: 'event', type: 'note', content: '吃饭和游泳', occurredAt: event.startTime, createdAt: event.createdAt, updatedAt: event.updatedAt }
  const projected = flattenJournal([event, { ...event, id: 'other', memberId: 'another-child' }], new Map([['event', [raw, { ...raw, id: 'foreign', accountId: 'foreign' }]]]), new Map(), 'child')
  assert.equal(projected.length, 1)
  assert.equal(projected[0].content, raw.content)
  assert.deepEqual(projected[0].categories, ['other'])
  assert.equal(journalTime(projected[0]).label, '09:00')
  assert.equal(flattenJournal([event], new Map(), new Map(), 'child')[0].content, event.title)
  assert.equal(flattenJournal([event], new Map(), new Map(), 'another-child').length, 0)
})
test('calendar navigation crosses months and leap days without adding 24-hour instants', () => {
  assert.equal(shiftJournalDate('2026-01-01', -1), '2025-12-31')
  assert.equal(shiftJournalDate('2024-03-01', -1), '2024-02-29')
})
test('event updates remain one timeline item and sort by the latest update', () => {
  const event: HealthEventApiDto = { id: 'event', memberId: 'child', accountId: 'account', title: '发热', category: 'other', status: 'observing', startTime: '2026-09-05T16:16:00', createdAt: '2026-09-05T16:16:01', updatedAt: '2026-09-05T16:18:01' }
  const first: HealthEventRecordApiDto = { id: 'first', accountId: 'account', eventId: event.id, type: 'note', content: '孩子头顶部区域发热', occurredAt: '2026-09-05T16:16:00', createdAt: '2026-09-05T16:16:01', updatedAt: '2026-09-05T16:16:01', journal: { categories: ['symptom'], occurredAt: '2026-09-05T16:16:00', timePrecision: 'exact' } }
  const update: HealthEventRecordApiDto = { ...first, id: 'update', note: 'event-update:first', content: '体温升到38.5度', occurredAt: '2026-09-05T16:18:00', createdAt: '2026-09-05T16:18:01', updatedAt: '2026-09-05T16:18:01', journal: { ...first.journal, occurredAt: '2026-09-05T16:18:00' } }
  const projected = flattenJournal([event], new Map([[event.id, [update, first]]]), new Map(), 'child')
  assert.equal(projected.length, 1)
  assert.equal(projected[0].content, first.content)
  assert.equal(projected[0].occurredAt, update.occurredAt)
  assert.equal(projected[0].updateCount, 1)
  assert.equal(journalUpdateLabel(projected[0]), '16:16 首次记录 · 16:18 有更新')
})
test('independent legacy records sharing one event are not mistaken for update nodes', () => {
  const event: HealthEventApiDto = { id: 'event', memberId: 'child', accountId: 'account', title: '日常记录', category: 'other', status: 'observing', startTime: '2026-09-05T12:00:00', createdAt: '2026-09-05T12:00:01', updatedAt: '2026-09-05T13:00:01' }
  const first: HealthEventRecordApiDto = { id: 'diet', accountId: 'account', eventId: event.id, type: 'note', content: '吃午饭', occurredAt: '2026-09-05T12:00:00', createdAt: '2026-09-05T12:00:01', updatedAt: '2026-09-05T12:00:01', journal: { categories: ['diet'] } }
  const second: HealthEventRecordApiDto = { ...first, id: 'activity', content: '散步', occurredAt: '2026-09-05T13:00:00', createdAt: '2026-09-05T13:00:01', updatedAt: '2026-09-05T13:00:01', journal: { categories: ['activity'] } }
  assert.deepEqual(flattenJournal([event], new Map([[event.id, [first, second]]]), new Map(), 'child').map((item) => item.id), ['diet', 'activity'])
})
test('bowel occurrence number is scoped to the selected local day and ordered by occurred time', () => {
  const first = { ...entry('first', '2026-09-05T08:00:00'), categories: ['elimination'] as const }
  const second = { ...entry('second', '2026-09-05T16:00:00'), categories: ['elimination'] as const }
  const unrelated = { ...entry('diet', '2026-09-05T12:00:00'), categories: ['diet'] as const }
  assert.equal(bowelOccurrenceNumber([second, unrelated, first], first), 1)
  assert.equal(bowelOccurrenceNumber([second, unrelated, first], second), 2)
  assert.equal(bowelOccurrenceNumber([second, unrelated, first], unrelated), null)
})

test('list summaries keep medication names while hiding doses', () => {
  const medication = {
    ...entry('medication', '2026-09-10T12:16:00'),
    categories: ['medication'] as const,
    content: '阿司匹林 · 1 mL\n地奈德 · 1 mL',
    medication: {
      medicationName: '阿司匹林', administrationRoute: 'oral' as const,
      medications: [
        { id: 'one', medicationName: '阿司匹林', amountValue: 1, amountUnit: 'mL', dosageStep: 0.1 },
        { id: 'two', medicationName: '地奈德', amountValue: 1, amountUnit: 'mL', dosageStep: 0.1 },
      ],
    },
  }
  assert.equal(journalListSummary(medication), '阿司匹林、地奈德')
})

test('feeding list summaries omit eating statuses but retain method and duration', () => {
  const feeding = {
    ...entry('feeding', '2026-09-10T08:49:00'),
    categories: ['diet'] as const,
    content: '母乳 · 1分钟 · 顺利、吐奶',
    diet: { kind: 'feeding' as const, feedingMethod: 'breast' as const, breastSeconds: { left: 30, right: 30, total: 60 }, feedingStatuses: ['顺利', '吐奶'] },
  }
  assert.equal(journalListSummary(feeding), '母乳 · 1分钟')
})

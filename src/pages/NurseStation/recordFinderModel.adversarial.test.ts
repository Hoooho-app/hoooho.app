import test from 'node:test'
import assert from 'node:assert/strict'
import { finderPlan, findRecords, lookupRecords } from './recordFinderModel'
import type { JournalEntry } from '../HealthEvents/timeViewModel'

const now = new Date(2026, 9, 18, 10)
const at = (days: number, hour = 8) => new Date(2026, 9, 18 - days, hour).toISOString()
const row = (id: string, content: string, occurredAt: string, patch: Partial<JournalEntry> = {}): JournalEntry => ({ id, eventId: 'search-regression', content, occurredAt, createdAt: occurredAt, categories: ['symptom'], timePrecision: 'exact', attachmentCount: 0, status: 'observing', ...patch })
const records = [row('yesterday', '发烧38.2℃', at(1)), row('today', '发烧38.5℃', at(0)), row('negative', '今天没有发烧', at(0, 9)), row('two-days-ago', '发烧38.1℃', at(2))]

test('HIA-AI-008 latest symptom applies polarity before limiting one record', () => {
  for (const query of ['最近一次发烧', '上次发热']) {
    assert.deepEqual(lookupRecords(records, query, now).map(match => [match.entry.id, match.related]), [['today', false]])
  }
  const unknown = row('unknown', '发烧39℃', at(0, 9), {timePrecision: 'unknown'})
  assert.equal(lookupRecords([...records, unknown], '最近一次发烧', now)[0].entry.id, 'today')
})

test('latest query keeps negative evidence as uncertain when there is no affirmative occurrence', () => {
  const matches = lookupRecords(records.filter(record => record.id === 'negative'), '最近一次发烧', now)
  assert.deepEqual(matches.map(match => [match.entry.id, match.related]), [['negative', true]])
  assert.match(matches[0].reason ?? '', /否定/)
  assert.deepEqual(lookupRecords(records, '最近一次没有发烧', now).map(match => match.entry.id), ['negative'])
})

test('HIA-AI-009 today and yesterday aliases have identical dates and polarity', () => {
  const result = (query: string) => lookupRecords(records, query, now).map(match => [match.entry.id, match.related, match.reason])
  assert.deepEqual(result('今日发烧'), result('今天发烧'))
  assert.deepEqual(result('昨日发烧'), result('昨天发烧'))
  assert.deepEqual(result('今日发烧').map(match => match.slice(0, 2)), [['today', false], ['negative', true]])
})

test('HIA-AI-010 connected day phrases remove and/or words and preserve their union', () => {
  const ids = (query: string) => lookupRecords(records, query, now).map(match => match.entry.id)
  for (const query of ['昨天和今天发烧', '昨天和今天的发烧记录', '今天或者昨天发烧', '昨日以及今日的发烧记录', '今天、昨天发烧', '昨天或今天发烧']) {
    assert.deepEqual(ids(query), ['today', 'yesterday', 'negative'], query)
  }
  assert.deepEqual(ids('前天和今天发烧'), ['today', 'two-days-ago', 'negative'])
  assert.equal(finderPlan('前天和今天发烧', undefined, now).dateRanges?.length, 2)
})

test('day union keeps midnight boundaries, excludes other days and retains unknown-time evidence', () => {
  const rows = [...records, row('before', '发烧37.9℃', new Date(2026, 9, 16, 23, 59, 59, 999).toISOString()), row('start', '发烧37.8℃', new Date(2026, 9, 17).toISOString()), row('unknown', '发烧但时间未明确', at(9), { timePrecision: 'unknown' })]
  const matches = lookupRecords(rows, '昨天和今天发烧', now)
  assert.deepEqual(matches.map(match => match.entry.id), ['today', 'yesterday', 'start', 'negative', 'unknown'])
  assert.equal(matches.at(-1)?.related, true)
})

test('refined compound-date queries and matter changes cannot widen disjoint dates', () => {
  const rows = [row('face-before', '脸颊皮疹', at(2)), row('excluded-middle', '脸颊皮疹好转', at(1)), row('face-today', '脸颊皮疹好转', at(0)), row('leg', '腿上皮疹', at(0, 9), {eventId: 'other'})]
  const plan = finderPlan('前天和今天皮疹后来有什么变化', undefined, now)
  const refined = finderPlan('只看脸颊', plan, now)
  assert.deepEqual(findRecords(rows, refined).map(match => match.entry.id), ['face-today', 'face-before'])
})

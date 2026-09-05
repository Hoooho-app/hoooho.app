import assert from 'node:assert/strict'
import test from 'node:test'
import { projectJournalRecord, validateJournal } from './journal-metadata.mjs'
import { HealthEventService } from './health-event-service.mjs'

test('journal keeps untitled lifestyle containers without changing the legacy event list', async () => {
  const rows = [{ id: 'lifestyle', title: '' }, { id: 'medical', title: '症状' }]
  const service = new HealthEventService({ members: {}, repository: { findByAccountId: async (accountId) => accountId === 'owner' ? rows : [] } })
  assert.deepEqual(await service.listJournal('owner'), rows)
  assert.deepEqual((await service.list('owner')).map((row) => row.id), ['medical'])
  assert.deepEqual(await service.listJournal('someone-else'), [])
})

const record = (content, extra = {}) => ({ content, sourceType: 'voice_record', occurredAt: '2026-09-05T15:00:00Z', createdAt: '2026-09-05T15:01:00Z', ...extra })
test('period remains a period and records without a spoken time use their recorded minute', () => {
  const raw = record('晚上起了一片疹子')
  const result = projectJournalRecord(raw)
  assert.equal(result.journal.timePrecision, 'period')
  assert.equal(result.journal.timeLabel, '晚上')
  assert.equal(result.occurredAt, raw.occurredAt)
  assert.equal(raw.journal, undefined)
  assert.equal(projectJournalRecord(record('身上起了一片疹子')).journal.timePrecision, 'exact')
})
test('explicit time and yesterday are projected using the recording reference day and timezone', () => {
  const result = projectJournalRecord(record('昨天晚上9点15分起疹'), 'Asia/Shanghai')
  assert.equal(result.journal.timePrecision, 'exact')
  assert.equal(Date.parse(result.journal.occurredAt), Date.parse('2026-09-04T21:15:00+08:00'))
  const midnight = projectJournalRecord(record('昨天09:15吃饭', { createdAt: '2026-09-05T01:00:00Z' }), 'America/Los_Angeles')
  assert.equal(Date.parse(midnight.journal.occurredAt), Date.parse('2026-09-03T09:15:00-07:00'))
})
test('a spoken day without a clock keeps the recorded minute on that calendar day', () => {
  const today = projectJournalRecord(record('今天散步'), 'Asia/Shanghai')
  assert.equal(today.journal.timePrecision, 'exact')
  assert.equal(Date.parse(today.journal.occurredAt), Date.parse('2026-09-05T23:00:00+08:00'))
  const yesterday = projectJournalRecord(record('昨天起疹'), 'Asia/Shanghai')
  assert.equal(yesterday.journal.timePrecision, 'exact')
  assert.equal(Date.parse(yesterday.journal.occurredAt), Date.parse('2026-09-04T23:00:00+08:00'))
})
test('ambiguous multi-time text is kept intact and uses the recorded minute', () => {
  const raw = record('17:30游泳，21:15起疹')
  assert.equal(projectJournalRecord(raw).journal.timePrecision, 'exact')
  assert.equal(projectJournalRecord(raw).content, raw.content)
})
test('future and fuzzy text never override the current recorded minute', () => {
  for (const text of ['身上有一点痒', '一点点痒', '明天上午9点复诊', '晚上23:59吃饭', '小时候经常起疹']) {
    const result = projectJournalRecord(record(text))
    assert.equal(result.journal.timePrecision, 'exact')
    assert.equal(result.journal.occurredAt, record(text).occurredAt)
  }
})
test('explicitly selected legacy time and optional categories remain compatible', () => {
  const raw = record('发生了不舒服', { sourceType: 'user_record', journal: { categories: ['symptom'] } })
  assert.equal(projectJournalRecord(raw).journal.timePrecision, 'exact')
  assert.deepEqual(projectJournalRecord(raw).journal.categories, ['symptom'])
  assert.equal(validateJournal(undefined), undefined)
  assert.deepEqual(validateJournal({ categories: ['diet', 'social', 'diet'] }), { categories: ['diet', 'social'] })
  assert.throws(() => validateJournal({ categories: ['invalid'] }), /记录分类无效/)
})

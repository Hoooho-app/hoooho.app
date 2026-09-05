import assert from 'node:assert/strict'
import test from 'node:test'
import { projectJournalRecord, validateJournal } from './journal-metadata.mjs'

const record = (content, extra = {}) => ({ content, sourceType: 'voice_record', occurredAt: '2026-09-05T15:00:00Z', createdAt: '2026-09-05T15:01:00Z', ...extra })
test('period remains a period and submission time is never shown as an occurrence', () => {
  const raw = record('晚上起了一片疹子')
  const result = projectJournalRecord(raw)
  assert.equal(result.journal.timePrecision, 'period')
  assert.equal(result.journal.timeLabel, '晚上')
  assert.equal(result.occurredAt, raw.occurredAt)
  assert.equal(raw.journal, undefined)
  assert.equal(projectJournalRecord(record('身上起了一片疹子')).journal.timePrecision, 'unknown')
})
test('explicit time and yesterday are projected using the recording reference day and timezone', () => {
  const result = projectJournalRecord(record('昨天晚上9点15分起疹'), 'Asia/Shanghai')
  assert.equal(result.journal.timePrecision, 'exact')
  assert.equal(Date.parse(result.journal.occurredAt), Date.parse('2026-09-04T21:15:00+08:00'))
  const midnight = projectJournalRecord(record('昨天09:15吃饭', { createdAt: '2026-09-05T01:00:00Z' }), 'America/Los_Angeles')
  assert.equal(Date.parse(midnight.journal.occurredAt), Date.parse('2026-09-03T09:15:00-07:00'))
})
test('ambiguous multi-time text is kept intact instead of claiming one exact time', () => {
  const raw = record('17:30游泳，21:15起疹')
  assert.equal(projectJournalRecord(raw).journal.timePrecision, 'unknown')
  assert.equal(projectJournalRecord(raw).content, raw.content)
})
test('future inferred times and fuzzy historical periods never become an exact clock', () => {
  assert.equal(projectJournalRecord(record('身上有一点痒')).journal.timePrecision, 'unknown')
  assert.equal(projectJournalRecord(record('一点点痒')).journal.timePrecision, 'unknown')
  assert.equal(projectJournalRecord(record('明天上午9点复诊')).journal.timePrecision, 'unknown')
  assert.equal(projectJournalRecord(record('晚上23:59吃饭')).journal.timePrecision, 'unknown')
  assert.equal(projectJournalRecord(record('小时候经常起疹')).journal.timePrecision, 'unknown')
})
test('explicitly selected legacy time and optional categories remain compatible', () => {
  const raw = record('发生了不舒服', { sourceType: 'user_record', journal: { categories: ['symptom'] } })
  assert.equal(projectJournalRecord(raw).journal.timePrecision, 'exact')
  assert.deepEqual(projectJournalRecord(raw).journal.categories, ['symptom'])
  assert.equal(validateJournal(undefined), undefined)
  assert.deepEqual(validateJournal({ categories: ['diet', 'social', 'diet'] }), { categories: ['diet', 'social'] })
  assert.throws(() => validateJournal({ categories: ['invalid'] }), /记录分类无效/)
})

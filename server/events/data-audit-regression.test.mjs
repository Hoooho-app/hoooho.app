import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventService } from './health-event-service.mjs'
import { HealthEventRecordService } from './health-event-record-service.mjs'
import { HealthEventRecordRepository } from './repositories/health-event-record-repository.mjs'
import { QuickRecordService } from './quick-record-service.mjs'
import { CaseContinuityService } from './case-continuity-service.mjs'
import { validateJournal } from './journal-metadata.mjs'
import { JsonStore } from '../auth/storage/json-store.mjs'

const now = new Date('2026-10-17T12:00:00.000Z')
const occurredAt = '2026-09-10T02:00:00.000Z'
async function setup(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-data-audit-regression-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const members = new FamilyMemberRepository(dataDirectory)
  const child = await members.create({ accountId: 'account-a', name: '大宝', relationship: 'child' }, now)
  const sibling = await members.create({ accountId: 'account-a', name: '二宝', relationship: 'child' }, now)
  const foreign = await members.create({ accountId: 'account-b', name: '另一账号的孩子', relationship: 'child' }, now)
  const events = new HealthEventService({ dataDirectory })
  const records = new HealthEventRecordService({ dataDirectory, organizations: { invalidateAndRecompute: async () => undefined }, changeAnnotations: { recompute: async () => undefined } })
  const quick = new QuickRecordService({ dataDirectory, events, records })
  const event = await events.create('account-a', { memberId: child.id, title: '皮疹', category: 'allergy', startTime: occurredAt }, now)
  const siblingEvent = await events.create('account-a', { memberId: sibling.id, title: '咳嗽', category: 'cough', startTime: occurredAt }, now)
  const foreignEvent = await events.create('account-b', { memberId: foreign.id, title: '咳嗽', category: 'cough', startTime: occurredAt }, now)
  const create = (journal, extra = {}) => records.create('account-a', event.id, { type: 'note', content: '实际观察记录', occurredAt, journal, ...extra }, now)
  const persisted = (id) => new HealthEventRecordRepository(dataDirectory).findById(id)
  return { dataDirectory, members, child, sibling, foreign, events, records, quick, event, siblingEvent, foreignEvent, create, persisted }
}
const drug = (id = 'drug-one') => ({ id, medicationName: '外用药膏', amountValue: 1, amountUnit: '次', dosageStep: 1 })
const medication = { categories: ['medication'], medication: { medicationName: '药膏', administrationRoute: 'topical' } }
const validSleep = { categories: ['sleep'], sleep: { kind: 'night', status: 'completed', sleepAt: '2026-09-09T12:00:00.000Z', wakeAt: '2026-09-09T22:00:00.000Z' } }
const rejection = (code) => (error) => error.status >= 400 && error.status < 500 && (!code || error.code === code)

test('multi-drug records preserve the parent route and metadata in storage and on edit', async (t) => {
  const s = await setup(t)
  const source = await s.create({ categories: ['symptom'] }, { type: 'symptom', content: '发痒' })
  const journal = { categories: ['medication'], medication: { medications: [drug(), { ...drug('drug-two'), medicationName: '另一种外用药' }], administrationRoute: 'topical', note: '只记录已使用', linkedSymptomRecordIds: [source.id] } }
  const created = await s.create(journal)
  let saved = await s.persisted(created.id)
  assert.equal(saved.journal.medication.administrationRoute, 'topical')
  assert.equal(saved.journal.medication.note, '只记录已使用')
  assert.deepEqual(saved.journal.medication.linkedSymptomRecordIds, [source.id])
  await s.records.update('account-a', created.id, { journal: { ...journal, medication: { ...journal.medication, medications: [{ ...drug(), amountValue: 2 }] } } }, now)
  saved = await s.persisted(created.id)
  assert.equal(saved.journal.medication.administrationRoute, 'topical')
  assert.equal(saved.journal.medication.medications[0].amountValue, 2)
  assert.throws(() => validateJournal({ ...journal, medication: { ...journal.medication, administrationRoute: 'invented' } }), rejection('INVALID_JOURNAL_MEDICATION'))
})

test('sleep rejects null/coercible/non-calendar start times without writing records', async (t) => {
  const s = await setup(t)
  for (const sleepAt of [null, 0, false, [], '2026-02-30T12:00:00Z']) {
    await assert.rejects(() => s.create({ ...validSleep, sleep: { ...validSleep.sleep, sleepAt } }), rejection('INVALID_JOURNAL_SLEEP'))
  }
  assert.equal((await s.records.list('account-a', s.event.id)).length, 0)
  const valid = await s.create(validSleep)
  assert.equal((await s.persisted(valid.id)).journal.sleep.durationMinutes, 600)
})

test('changing only occurredAt cannot contradict an existing sleep or meal interval', async (t) => {
  const s = await setup(t)
  const sleeping = await s.create(validSleep)
  await assert.rejects(() => s.records.update('account-a', sleeping.id, { occurredAt: '2026-09-08T01:00:00Z' }, now), rejection('INCONSISTENT_OCCURRED_AT'))
  assert.equal((await s.persisted(sleeping.id)).occurredAt, validSleep.sleep.wakeAt)
  const diet = { categories: ['diet'], diet: { kind: 'meal', startedAt: '2026-09-10T01:00:00Z', endedAt: '2026-09-10T01:30:00Z' } }
  const eating = await s.create(diet)
  await assert.rejects(() => s.records.update('account-a', eating.id, { occurredAt: '2026-09-09T01:00:00Z' }, now), rejection('INCONSISTENT_OCCURRED_AT'))
  await s.records.update('account-a', sleeping.id, { journal: { ...validSleep, sleep: { ...validSleep.sleep, wakeAt: '2026-09-09T23:00:00Z' } } }, now)
  const saved = await s.persisted(sleeping.id)
  assert.equal(saved.occurredAt, saved.journal.sleep.wakeAt)
  assert.equal(saved.journal.sleep.durationMinutes, 660)
})

test('every medication, vaccine and visit relation rejects missing, foreign-account and sibling targets', async (t) => {
  const s = await setup(t)
  const sibling = await s.records.create('account-a', s.siblingEvent.id, { type: 'symptom', content: '二宝咳嗽', occurredAt }, now)
  const foreign = await s.records.create('account-b', s.foreignEvent.id, { type: 'symptom', content: '另一账号咳嗽', occurredAt }, now)
  const journals = id => [
    { ...medication, medication: { ...medication.medication, linkedSymptomRecordIds: [id] } },
    { categories: ['vaccination'], vaccination: { items: [{ id: 'v1', vaccineName: '乙肝疫苗', doseSequence: 'dose_1' }], linkedSymptomRecordIds: [id] } },
    { categories: ['visit'], visit: { visitType: 'outpatient', linkedSymptomRecordIds: [id] } }
  ]
  for (const id of ['missing-record', sibling.id, foreign.id]) for (const journal of journals(id)) await assert.rejects(() => s.create(journal), rejection('INVALID_RELATED_RECORD'))
  assert.equal((await s.records.list('account-a', s.event.id)).length, 0)
  const own = await s.create({ categories: ['symptom'] }, { type: 'symptom' })
  for (const journal of journals(own.id)) assert.ok((await s.create(journal)).id)
  const dose = (await s.records.list('account-a', s.event.id)).find(r => r.journal?.medication)
  await assert.rejects(() => s.records.update('account-a', dose.id, { journal: journals(sibling.id)[0] }, now), rejection('INVALID_RELATED_RECORD'))
  assert.deepEqual((await s.persisted(dose.id)).journal.medication.linkedSymptomRecordIds, [own.id])
})

test('relations require the actual requested category and support valid older typed records', async (t) => {
  const s = await setup(t)
  const note = await s.create({ categories: ['other'] })
  await assert.rejects(() => s.create({ ...medication, medication: { ...medication.medication, linkedSymptomRecordIds: [note.id] } }), rejection('INVALID_RELATED_RECORD'))
  const visit = await s.create({ categories: ['visit'], visit: { visitType: 'outpatient' } }, { type: 'visit' })
  const other = await s.records.create('account-a', s.siblingEvent.id, { type: 'visit', content: '二宝门诊', occurredAt }, now)
  await assert.rejects(() => s.create({ categories: ['visit'], visit: { visitType: 'follow_up', linkedVisitRecordId: other.id } }), rejection('INVALID_RELATED_RECORD'))
  const valid = await s.create({ categories: ['visit'], visit: { visitType: 'follow_up', linkedVisitRecordId: visit.id } })
  assert.equal((await s.persisted(valid.id)).journal.visit.linkedVisitRecordId, visit.id)
})

test('invalid natural dates never roll into a different day while timezone offsets remain valid', async (t) => {
  const s = await setup(t)
  for (const startTime of ['2026-02-30T12:00:00Z', '2025-02-29T12:00:00Z']) await assert.rejects(() => s.events.create('account-a', { memberId: s.child.id, title: '测试', category: 'other', startTime }, now), rejection('INVALID_START_TIME'))
  for (const at of ['2026-02-30T12:00:00Z', '2025-02-29T12:00:00Z']) await assert.rejects(() => s.create(undefined, { occurredAt: at }), rejection('INVALID_OCCURRED_AT'))
  const valid = await s.create(undefined, { occurredAt: '2026-09-10T04:00:00+02:00' })
  assert.equal((await s.persisted(valid.id)).occurredAt, occurredAt)
  const reminder = { enabled: true, configured: true, frequency: 'custom', timesPerDay: 1, times: ['08:00'], durationDays: 5, selectedDates: ['2026-02-30'] }
  assert.throws(() => validateJournal({ categories: ['medication'], medication: { medications: [{ ...drug(), reminder }] } }), rejection('INVALID_JOURNAL_MEDICATION'))
  assert.throws(() => validateJournal({ categories: ['medication'], medication: { medications: [{ ...drug(), reminder: { ...reminder, frequency: 'daily', endDate: '2026-02-30' } }] } }), rejection('INVALID_JOURNAL_MEDICATION'))
  assert.throws(() => validateJournal({ categories: ['medication'], medication: { medications: [{ ...drug(), reminder: { ...reminder, frequency: 'interval_hours', intervalHours: 6, firstReminderAt: '2026-02-30T08:00' } }] } }), rejection('INVALID_JOURNAL_MEDICATION'))
})

test('actual visit instants reject future values while planned follow-up remains available', async (t) => {
  const s = await setup(t)
  for (const key of ['admittedAt', 'dischargedAt', 'emergencyArrivalAt', 'emergencyDepartureAt']) {
    await assert.rejects(() => s.create({ categories: ['visit'], visit: { visitType: 'inpatient', [key]: '2026-10-18T00:00:00Z' } }), rejection('FUTURE_OCCURRED_AT'))
  }
  const good = await s.create({ categories: ['visit'], visit: { visitType: 'outpatient', followUpAt: '2026-10-18T00:00:00Z', expectedResultAt: '2026-10-19T00:00:00Z' } })
  assert.equal((await s.persisted(good.id)).journal.visit.followUpAt, '2026-10-18T00:00:00.000Z')
})

test('medication and vaccine IDs are unique after whitespace normalization', async (t) => {
  const s = await setup(t)
  for (const ids of [['same', ' same '], [' same ', 'same']]) await assert.rejects(() => s.create({ categories: ['medication'], medication: { medications: ids.map(id => drug(id)) } }), rejection('INVALID_JOURNAL_MEDICATION'))
  for (const ids of [['same', ' same '], [' same ', 'same']]) await assert.rejects(() => s.create({ categories: ['vaccination'], vaccination: { items: ids.map(id => ({ id, vaccineName: '乙肝疫苗', doseSequence: 'dose_1' })) } }), rejection('INVALID_JOURNAL_VACCINATION'))
  assert.equal((await s.records.list('account-a', s.event.id)).length, 0)
})

test('quick record retries preserve one result and reject key reuse for different children or payloads', async (t) => {
  const s = await setup(t)
  const input = { memberId: s.child.id, title: '午餐收记', content: '午餐吃了胡萝卜和米粉', occurredAt, inputChannel: 'text', idempotencyKey: 'audit_retry_key_001', journal: { categories: ['diet'] } }
  const first = await s.quick.create('account-a', input, now)
  const again = await s.quick.create('account-a', input, now)
  assert.equal(again.recordId, first.recordId)
  assert.equal(again.idempotent, true)
  await assert.rejects(() => s.quick.create('account-a', { ...input, memberId: s.sibling.id }, now), rejection('IDEMPOTENCY_CONFLICT'))
  await assert.rejects(() => s.quick.create('account-a', { ...input, content: '午餐另一份真实内容' }, now), rejection('IDEMPOTENCY_CONFLICT'))
  const simultaneous = { ...input, content: '下午睡醒喝了水，这是单独一条', idempotencyKey: 'audit_parallel_key_001', occurredAt: '2026-09-11T02:00:00Z' }
  const [a, b] = await Promise.all([s.quick.create('account-a', simultaneous, now), s.quick.create('account-a', simultaneous, now)])
  assert.equal(a.recordId, b.recordId)
  const inflightInput = { ...input, content: '完全不同的另一次记录', occurredAt: '2026-09-12T02:00:00Z', idempotencyKey: 'audit_parallel_key_002' }
  const work = s.quick.create('account-a', inflightInput, now)
  await assert.rejects(() => s.quick.create('account-a', { ...inflightInput, memberId: s.sibling.id }, now), rejection('IDEMPOTENCY_CONFLICT'))
  await work
  assert.equal((await s.records.repository.findByAccountId('account-a')).length, 3)
})

test('malformed quick-photo payloads are rejected before any event or record is written', async (t) => {
  const s = await setup(t)
  const before = (await s.events.listJournal('account-a')).length
  for (const photoIds of ['some-id', null, {}, [null], [''], [123]]) {
    await assert.rejects(() => s.quick.create('account-a', { memberId: s.child.id, title: '照片记录', content: '一条含照片的真实记录', occurredAt, inputChannel: 'text', idempotencyKey: 'audit_bad_photo_key', photoIds }, now), rejection('INVALID_PHOTO_IDS'))
  }
  assert.equal((await s.events.listJournal('account-a')).length, before)
  assert.equal((await s.records.repository.findByAccountId('account-a')).length, 0)
})

test('known temperature fields enforce numeric values and the chart-supported range without inventing missing facts', async (t) => {
  const s = await setup(t)
  const journal = specific => ({ categories: ['symptom'], symptom: { symptomCategory: 'fever', narrative: '测量体温后记录', symptomSpecificData: specific } })
  for (const key of ['currentTemperature', 'maxTemperature']) for (const value of [0, -1, 19.9, 50.1, 999, '38.5', '很热', false]) await assert.rejects(() => s.create(journal({ [key]: value })), rejection('INVALID_JOURNAL_TEMPERATURE'))
  for (const value of [20, 38.5, 50]) {
    const valid = await s.create(journal({ currentTemperature: value }))
    assert.equal((await s.persisted(valid.id)).journal.symptom.symptomSpecificData.currentTemperature, value)
  }
  const missing = await s.create({ categories: ['symptom'], symptom: { symptomCategory: 'fever', narrative: '尚未测量' } })
  assert.equal((await s.persisted(missing.id)).journal.symptom.symptomSpecificData, undefined)
})

test('direct service boundaries reject malformed objects and titles; empty initial string remains valid', async (t) => {
  const s = await setup(t)
  for (const input of [null, [], 'bad']) {
    await assert.rejects(() => s.events.create('account-a', input, now), rejection())
    await assert.rejects(() => s.events.update('account-a', s.event.id, input, now), rejection())
    await assert.rejects(() => s.records.create('account-a', s.event.id, input, now), rejection())
    await assert.rejects(() => s.quick.create('account-a', input, now), rejection())
  }
  await assert.rejects(() => s.events.create('account-a', { memberId: s.child.id, title: { text: '发烧' }, category: 'other', startTime: occurredAt }, now), rejection('INVALID_EVENT_TITLE'))
  assert.equal((await s.events.create('account-a', { memberId: s.child.id, title: '', category: 'other', startTime: occurredAt }, now)).title, '')
  const cases = new CaseContinuityService({ dataDirectory: s.dataDirectory })
  await assert.rejects(() => cases.capture('account-a', s.child.id, { text: '补充资料', requestId: 'audit_null_file', occurredAt, files: [null] }), rejection())
})


test('legacy successful quick requests without fingerprints retain valid retry and member isolation', async (t) => {
  const s = await setup(t)
  const input = { memberId: s.child.id, title: '原始午餐收记', content: '旧版本保存的午餐胡萝卜米饭', occurredAt, inputChannel: 'text', idempotencyKey: 'audit_legacy_request', journal: { categories: ['diet'] } }
  const first = await s.quick.create('account-a', input, now)
  const store = new JsonStore(path.join(s.dataDirectory, 'quick-record-requests.json'), { requests: [] })
  await store.update(data => ({ ...data, requests: data.requests.map(({ requestFingerprint, ...legacy }) => legacy) }))
  assert.equal((await s.quick.create('account-a', input, now)).recordId, first.recordId)
  await assert.rejects(() => s.quick.create('account-a', { ...input, memberId: s.sibling.id }, now), rejection('IDEMPOTENCY_CONFLICT'))
  await assert.rejects(() => s.quick.create('account-a', { ...input, content: '不应以旧请求覆盖新正文' }, now), rejection('IDEMPOTENCY_CONFLICT'))
  assert.equal((await s.records.repository.findByAccountId('account-a')).length, 1)
})

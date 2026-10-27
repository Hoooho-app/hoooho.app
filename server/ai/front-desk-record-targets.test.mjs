import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { HealthEventService } from '../events/health-event-service.mjs'
import { HealthEventRecordService } from '../events/health-event-record-service.mjs'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { accessibleFrontDeskTargets, frontRecordVersion } from './front-desk-record-targets.mjs'

const accountId = 'synthetic-account', memberId = 'synthetic-member'
const now = new Date('2026-10-20T10:00:00.000Z')
const context = (overrides = {}) => ({ id: 'context-1', accountId, memberId, saved: true, recordResult: { records: [{ recordId: 'record-1' }] }, ...overrides })
const record = (overrides = {}) => ({ id: 'record-1', accountId, eventId: 'event-1', type: 'symptom', content: '合成观察', sourceText: '合成原话', updatedAt: now.toISOString(), aiProvenance: { confirmed: true, sources: [{ quote: '合成原话' }] }, ...overrides })
const event = (overrides = {}) => ({ id: 'event-1', accountId, memberId, title: '合成情况', category: 'other', ...overrides })

function fixture(records = [record()], events = [event()]) {
  const recordCalls = [], eventCalls = []
  return {
    recordCalls, eventCalls,
    business: {
      records: { getOwnedRecord: async (owner, id) => { recordCalls.push([owner, id]); return records.find(record => record.id === id) } },
      events: { get: async (owner, id) => { eventCalls.push([owner, id]); return events.find(event => event.id === id) } },
      latest() { assert.fail('must not read latest') },
      list() { assert.fail('must not list records') }
    }
  }
}

test('continuous raw save receipts resolve the exact record with live ownership and revision checks',async()=>{
 const f=fixture(),current=context({saved:false,recordResult:null,continuousRecord:true,currentRecord:{memberId,recordId:'record-1',eventId:'event-1'}})
 const targets=await accessibleFrontDeskTargets({...f,accountId,memberId,contexts:[current]})
 assert.equal(targets.length,1);assert.equal(targets[0].id,'record-1');assert.equal(targets[0].version,frontRecordVersion(record()))
 assert.deepEqual(await accessibleFrontDeskTargets({...f,accountId,memberId:'another-member',contexts:[current]}),[])
 assert.deepEqual(await accessibleFrontDeskTargets({...fixture([],[]),accountId,memberId,contexts:[current]}),[])
})

test('only saved context exact IDs are resolved and snapshots do not alias stored objects', async () => {
  const stored = record(), f = fixture([stored, record({ id: 'unmentioned-record' })])
  const targets = await accessibleFrontDeskTargets({ ...f, accountId, memberId, contexts: [context()] })
  assert.equal(targets.length, 1)
  assert.deepEqual(f.recordCalls, [[accountId, 'record-1']])
  assert.deepEqual(f.eventCalls, [[accountId, 'event-1']])
  assert.deepEqual(targets[0], { id: 'record-1', version: frontRecordVersion(stored), kind: 'record', contextId: 'context-1', subjectConfirmed: true, title: stored.content, category: 'symptom', record: stored })
  targets[0].record.aiProvenance.sources[0].quote = '本地测试修改'
  assert.equal(stored.aiProvenance.sources[0].quote, '合成原话')
})

test('context ownership and saved result are mandatory before any read', async () => {
  const f = fixture()
  const contexts = [context({ accountId: 'other' }), context({ memberId: 'other' }), context({ saved: false }), context({ deletedAt: now.toISOString() }), context({ id: '' })]
  assert.deepEqual(await accessibleFrontDeskTargets({ ...f, accountId, memberId, contexts }), [])
  assert.deepEqual(f.recordCalls, [])
  assert.deepEqual(f.eventCalls, [])
})

test('record and event must both have the exact account, ID and member ownership', async t => {
  for (const [name, records, events] of [
    ['foreign record owner', [record({ accountId: 'foreign' })], [event()]],
    ['foreign record member', [record({ memberId: 'foreign' })], [event()]],
    ['foreign event owner', [record()], [event({ accountId: 'foreign' })]],
    ['foreign event member', [record()], [event({ memberId: 'foreign' })]],
    ['missing record', [], [event()]],
    ['missing event', [record()], []],
    ['deleted record', [record({ deleted: true })], [event()]],
    ['unavailable record', [record({ available: false })], [event()]],
    ['deleted event', [record()], [event({ deletedAt: now.toISOString() })]],
    ['unavailable event', [record()], [event({ status: 'unavailable' })]]
  ]) await t.test(name, async () => {
    assert.deepEqual(await accessibleFrontDeskTargets({ ...fixture(records, events), accountId, memberId, contexts: [context()] }), [])
  })
  const wrongId = fixture()
  wrongId.business.records.getOwnedRecord = async () => record({ id: 'different-record' })
  assert.deepEqual(await accessibleFrontDeskTargets({ ...wrongId, accountId, memberId, contexts: [context()] }), [])
  const wrongEvent = fixture()
  wrongEvent.business.events.get = async () => event({ id: 'different-event' })
  assert.deepEqual(await accessibleFrontDeskTargets({ ...wrongEvent, accountId, memberId, contexts: [context()] }), [])
})

test('unavailable exact reads are omitted without preventing another exact target', async () => {
  const f = fixture([record({ id: 'record-2' })])
  f.business.records.getOwnedRecord = async (_owner, id) => { if (id === 'record-1') throw Object.assign(new Error('not available'), { status: 503 }); return record({ id }) }
  assert.deepEqual((await accessibleFrontDeskTargets({ ...f, accountId, memberId, contexts: [context({ recordResult: { records: [{ recordId: 'record-1' }, { recordId: 'record-2' }] } })] })).map(target => target.id), ['record-2'])
})

test('true save receipts resolve exact IDs; failed, foreign-context and other operation claims do not', async () => {
  const records = ['direct', 'many', 'nested', 'legacy-result', 'fake', 'draft-target'].map(id => record({ id }))
  const receipts = [
    { type: 'save', state: 'saved', recordId: 'direct' },
    { type: 'save_original', success: true, recordIds: ['many'] },
    { type: 'save', saved: true, result: { records: [{ recordId: 'nested' }, { id: 'legacy-result' }] } },
    { type: 'save', state: 'failed', success: true, recordId: 'fake' },
    { type: 'save', status: 'failed', success: true, recordId: 'fake' },
    { type: 'save', state: 'pending', saved: true, recordId: 'fake' },
    { type: 'save', state: 'saved', success: false, recordId: 'fake' },
    { type: 'save', state: 'saved', contextId: 'other-context', recordId: 'fake' },
    { type: 'delete', success: true, recordIds: ['fake'] },
    { state: 'saved', recordId: 'fake' },
    { type: 'save', state: 'saved', targetId: 'draft-target', id: 'fake' },
    { type: 'save', state: 'pending', recordId: 'fake' },
    { type: 'save', state: 'saved', recordIds: 'fake' }
  ]
  const f = fixture(records)
  const targets = await accessibleFrontDeskTargets({ ...f, accountId, memberId, contexts: [context({ saved: false, operationReceipts: receipts })] })
  assert.deepEqual(targets.map(target => target.id), ['direct', 'many', 'nested', 'legacy-result'])
  assert.deepEqual(f.recordCalls.map(([_owner, id]) => id), ['direct', 'many', 'nested', 'legacy-result'])
})

test('repeated IDs are stable and at most twelve accessible targets are returned', async () => {
  const records = Array.from({ length: 20 }, (_, i) => record({ id: `record-${i}` })), f = fixture(records)
  const contexts = [context({ recordResult: { records: records.map(record => ({ recordId: record.id })) }, operationReceipts: [{ type: 'save', state: 'saved', recordIds: records.map(record => record.id) }] }), context({ id: 'later-context', recordResult: { records: records.map(record => ({ recordId: record.id })) } })]
  const first = await accessibleFrontDeskTargets({ ...f, accountId, memberId, contexts })
  const second = await accessibleFrontDeskTargets({ ...fixture(records), accountId, memberId, contexts })
  assert.deepEqual(first, second)
  assert.equal(first.length, 12)
  assert.equal(f.recordCalls.length, 12)
  assert.equal(f.eventCalls.length, 12)
  assert.ok(first.every(target => target.contextId === 'context-1'))
  assert.deepEqual(first.map(target => target.id), records.slice(0, 12).map(record => record.id))
})

test('content revisions are deterministic safe positive 48-bit integers, including JSON edge values', () => {
  const original = record(), version = frontRecordVersion(original)
  assert.ok(Number.isSafeInteger(version) && version > 0 && version < 2 ** 48)
  const reordered = Object.fromEntries(Object.entries(original).reverse())
  reordered.aiProvenance = { sources: [{ quote: '合成原话' }], confirmed: true }
  assert.equal(frontRecordVersion(reordered), version)
  assert.equal(frontRecordVersion({ ...reordered, absent: undefined }), version)
  assert.equal(frontRecordVersion({ values: [undefined, null, NaN] }), frontRecordVersion({ values: [null, null, null] }))
  for (const changed of [
    { content: '另一条合成观察' }, { updatedAt: '2026-10-20T10:00:00.001Z' }, { sourceText: '另一份原话' },
    { aiProvenance: { confirmed: true, sources: [{ quote: '另一处来源' }] } },
    { journal: { categories: ['medication'] } }, { occurredAt: '2026-10-19T10:00:00.000Z' }
  ]) assert.notEqual(frontRecordVersion({ ...original, ...changed }), version)
  assert.notEqual(frontRecordVersion({ values: [1, 2] }), frontRecordVersion({ values: [2, 1] }))
  assert.throws(() => frontRecordVersion(undefined), TypeError)
})

test('real local services reject another owner, another member and physical deletion', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'front-record-targets-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const eventRepository = new HealthEventRepository(directory), recordRepository = new HealthEventRecordRepository(directory)
  const eventFor = (owner, member) => eventRepository.create({ accountId: owner, memberId: member, title: '合成情况', category: 'other', status: 'observing', startTime: now.toISOString() }, now)
  const event1 = await eventFor(accountId, memberId), event2 = await eventFor(accountId, 'other-member'), event3 = await eventFor('other-account', memberId)
  const records = await Promise.all([event1, event2, event3].map(event => recordRepository.create({ accountId: event.accountId, eventId: event.id, type: 'note', content: '合成原文', occurredAt: now.toISOString() }, now)))
  const business = { records: new HealthEventRecordService({ dataDirectory: directory, repository: recordRepository, events: eventRepository, organizations: {} }), events: new HealthEventService({ dataDirectory: directory, repository: eventRepository }) }
  const contexts = [context({ recordResult: { records: records.map(record => ({ recordId: record.id })) } })]
  assert.deepEqual((await accessibleFrontDeskTargets({ business, accountId, memberId, contexts })).map(target => target.id), [records[0].id])
  await recordRepository.delete(records[0].id)
  assert.deepEqual(await accessibleFrontDeskTargets({ business, accountId, memberId, contexts }), [])
})

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AccountDataService } from '../account/account-data-service.mjs'
import { DesensitizationTestService, classifyFoodName } from './desensitization-test-service.mjs'

const accountId = 'account-a'
const memberId = 'member-a'
const now = new Date('2026-09-26T02:00:00.000Z')

function dietRecord(id, eventId, occurredAt, foods, extra = {}) {
  return {
    id, accountId, eventId, type: 'journal', occurredAt, createdAt: occurredAt,
    content: foods.join('、'), sourceText: foods.join('和'),
    journal: { categories: ['diet'], diet: { foods, supplementNames: [], amount: extra.amount ?? '', foodForm: extra.preparation ?? '', reactions: extra.reactions ?? [] } }
  }
}

async function fixture(records = []) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-desensitization-'))
  const members = { async findById(id) { return id === memberId ? { id: memberId, accountId } : null } }
  const events = { async findByAccountId(id) { return id === accountId ? [{ id: 'event-a', memberId, accountId }] : [] } }
  const healthRecords = { async findByAccountId(id) { return records.filter((item) => item.accountId === id) } }
  const service = new DesensitizationTestService({ dataDirectory, members, events, healthRecords })
  return { service, cleanup: () => rm(dataDirectory, { recursive: true, force: true }) }
}

test('food classification keeps beef and milk separate and rejects ambiguous 牛', () => {
  assert.deepEqual(classifyFoodName('牛肉'), { categoryKey: 'beef', categoryLabel: '牛肉类', confidence: 'confirmed' })
  assert.deepEqual(classifyFoodName('牛奶'), { categoryKey: 'cow_milk', categoryLabel: '牛奶类', confidence: 'confirmed' })
  assert.throws(() => classifyFoodName('牛'), (error) => error.code === 'AMBIGUOUS_FOOD')
  assert.equal(classifyFoodName('鳕鱼').categoryKey, 'custom:鳕鱼')
})

test('suggestions use real last-30-day diet frequency and source links stay member scoped', async (t) => {
  const records = [
    dietRecord('r1', 'event-a', '2026-09-25T01:00:00.000Z', ['牛肉'], { amount: '10g' }),
    dietRecord('r2', 'event-a', '2026-09-24T01:00:00.000Z', ['牛肉']),
    dietRecord('r3', 'event-a', '2026-09-23T01:00:00.000Z', ['牛肉']),
    dietRecord('r4', 'event-a', '2026-09-22T01:00:00.000Z', ['牛肉丸']),
    dietRecord('r5', 'event-other', '2026-09-25T01:00:00.000Z', ['牛肉']),
    dietRecord('r6', 'event-a', '2026-08-01T01:00:00.000Z', ['牛肉'])
  ]
  const { service, cleanup } = await fixture(records); t.after(cleanup)
  const before = await service.list(accountId, memberId, now)
  assert.deepEqual(before.suggestions.map((item) => [item.name, item.count]), [['牛肉', 3]])
  const created = await service.create(accountId, { memberId, displayName: '牛肉' }, now)
  assert.equal(created.task.linkedRecords.find((item) => item.recordId === 'r1')?.relation, 'confirmed')
  assert.equal(created.task.linkedRecords.find((item) => item.recordId === 'r4')?.relation, 'pending')
  assert.equal(created.task.linkedRecords.some((item) => item.recordId === 'r5'), false)
})

test('same-category tasks do not duplicate and archived tasks are returned for an explicit restore choice', async (t) => {
  const { service, cleanup } = await fixture(); t.after(cleanup)
  const first = await service.create(accountId, { memberId, displayName: '牛肉' }, now)
  const duplicate = await service.create(accountId, { memberId, displayName: '牛肉泥' }, now)
  assert.equal(duplicate.existing, true)
  assert.equal(duplicate.task.id, first.task.id)
  const archivedTask = await service.mutateTask(accountId, first.task.id, 'archive', now, first.task.version)
  const archived = await service.create(accountId, { memberId, displayName: '炖牛肉' }, now)
  assert.equal(archived.task.status, 'archived')
  await assert.rejects(service.mutateTask(accountId, first.task.id, 'restore', now, first.task.version), (error) => error.code === 'VERSION_CONFLICT')
  await service.mutateTask(accountId, first.task.id, 'restore', now, archivedTask.version)
  assert.equal((await service.list(accountId, memberId, now)).tasks[0].status, 'active')
})

test('effective records require two explicit answers, support symptom without exposure, and preserve pause state', async (t) => {
  const { service, cleanup } = await fixture(); t.after(cleanup)
  const { task } = await service.create(accountId, { memberId, displayName: '鸡蛋' }, now)
  await assert.rejects(service.saveRecord(accountId, task.id, { status: 'effective', symptomAnswer: null, exposureAnswer: null, symptoms: [], note: '', actualFood: '', preparation: '', amount: '', occurredAt: now.toISOString() }, now), (error) => error.code === 'INCOMPLETE_OBSERVATION')
  await assert.rejects(service.saveRecord(accountId, task.id, { status: 'effective', symptomAnswer: 'absent', exposureAnswer: 'eaten', symptoms: [], note: '', actualFood: '', preparation: '', amount: '', occurredAt: '2026-09-27T00:00:00.000Z' }, now), (error) => error.code === 'FUTURE_OCCURRED_AT')
  const input = { status: 'effective', symptomAnswer: 'present', exposureAnswer: 'not_eaten', symptoms: ['红疹'], note: '', actualFood: '', preparation: '', amount: '', occurredAt: '2026-09-25T01:00:00.000Z', idempotencyKey: 'same-submit' }
  const first = await service.saveRecord(accountId, task.id, input, now)
  const repeated = await service.saveRecord(accountId, task.id, input, now)
  assert.equal(first.idempotent, false)
  assert.equal(repeated.idempotent, true)
  let listed = await service.list(accountId, memberId, now)
  assert.equal(listed.tasks[0].records.length, 1)
  assert.equal(listed.tasks[0].progressionPaused, true)
  assert.equal(listed.tasks[0].trend.at(-2).state, 'symptom')
  const updated = await service.updateRecord(accountId, task.id, first.record.id, { ...input, symptomAnswer: 'absent', symptoms: [], version: first.record.version }, now)
  listed = await service.list(accountId, memberId, now)
  assert.equal(listed.tasks[0].progressionPaused, true, 'ordinary edits must not resume progression')
  await service.undoRecordUpdate(accountId, task.id, first.record.id, updated.version, now)
  assert.equal((await service.list(accountId, memberId, now)).tasks[0].records[0].symptomAnswer, 'present')
  await assert.rejects(service.undoRecordUpdate(accountId, task.id, first.record.id, updated.version, now), (error) => error.code === 'UNDO_CONFLICT')
  const incompletePlan = { sourceType: 'caregiver_transcription', sourceName: '某医院', visitDate: '2026-09-20', food: '熟鸡蛋', preparation: '', firstAmount: '', unit: '', location: '', frequency: '', observationPeriod: '', progressionCondition: '', stopRule: '', reviewDate: '', resumeProgression: true }
  await service.savePlan(accountId, task.id, incompletePlan, now)
  assert.equal((await service.list(accountId, memberId, now)).tasks[0].progressionPaused, true)
  await service.savePlan(accountId, task.id, { ...incompletePlan, firstAmount: '1', unit: '克', location: '医院', observationPeriod: '2小时', stopRule: '出现症状即停止并按医生安排处理' }, now)
  assert.equal((await service.list(accountId, memberId, now)).tasks[0].progressionPaused, false)
})

test('drafts and withdrawn records do not become false all-clear days; delete supports undo without touching sources', async (t) => {
  const sources = [dietRecord('source-1', 'event-a', '2026-09-25T01:00:00.000Z', ['花生'])]
  const { service, cleanup } = await fixture(sources); t.after(cleanup)
  const { task } = await service.create(accountId, { memberId, displayName: '花生' }, now)
  const draft = await service.saveRecord(accountId, task.id, { status: 'draft', symptomAnswer: null, exposureAnswer: null, symptoms: [], note: '待补', actualFood: '', preparation: '', amount: '', occurredAt: '2026-09-25T02:00:00.000Z' }, now)
  let listed = await service.list(accountId, memberId, now)
  assert.equal(listed.tasks[0].trend.at(-2).state, 'unknown')
  const effective = await service.saveRecord(accountId, task.id, { status: 'effective', symptomAnswer: 'absent', exposureAnswer: 'eaten', symptoms: [], note: '', actualFood: '花生', preparation: '', amount: '', occurredAt: '2026-09-25T03:00:00.000Z' }, now)
  await service.withdrawRecord(accountId, task.id, effective.record.id, effective.record.version, now)
  listed = await service.list(accountId, memberId, now)
  assert.equal(listed.tasks[0].trend.at(-2).state, 'unknown')
  assert.equal(listed.tasks[0].records[0].id, draft.record.id)
  const deleted = await service.mutateTask(accountId, task.id, 'delete', now)
  assert.equal((await service.list(accountId, memberId, now)).tasks.length, 0)
  await service.mutateTask(accountId, deleted.id, 'undo-delete', now)
  listed = await service.list(accountId, memberId, now)
  assert.equal(listed.tasks.length, 1)
  assert.equal(listed.tasks[0].linkedRecords[0].recordId, 'source-1')
})

test('member ownership is enforced for every list entry point', async (t) => {
  const { service, cleanup } = await fixture(); t.after(cleanup)
  await assert.rejects(service.list('other-account', memberId, now), (error) => error.code === 'MEMBER_NOT_FOUND')
  await assert.rejects(service.create('other-account', { memberId, displayName: '牛奶' }, now), (error) => error.code === 'MEMBER_NOT_FOUND')
})

test('guest registration merge carries both tasks and records into the registered account', async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-desensitization-merge-')); t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const data = new AccountDataService({ dataDirectory })
  await data.store('desensitization-tests.json', 'tasks').update((value) => ({ ...value, tasks: [{ id: 'task-guest', accountId: 'guest:one' }] }))
  await data.store('desensitization-tests.json', 'records').update((value) => ({ ...value, records: [{ id: 'record-guest', accountId: 'guest:one' }] }))
  const merged = await data.mergeGuest('guest:one', 'registered-one', now)
  assert.equal(merged.merged, true)
  const stored = await data.store('desensitization-tests.json', 'tasks').read()
  assert.equal(stored.tasks[0].accountId, 'registered-one')
  assert.equal(stored.records[0].accountId, 'registered-one')
})

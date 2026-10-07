import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { RoutineService } from './routine-service.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { dailySnapshot, zonedInstant } from './daily-record-service.mjs'
import { QuickRecordService } from '../events/quick-record-service.mjs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { AccountDataService } from '../account/account-data-service.mjs'
import { createServer } from 'node:http'
import { routinesApiPlugin } from './vite-routines-plugin.mjs'
import { quickRecordsApiPlugin } from '../events/vite-quick-records-plugin.mjs'
import { TokenService } from '../auth/token-service.mjs'

test('Vite development API mirrors settings, atomic record save, ownership and proposal routes', async () => {
  const { member, input, dataDirectory } = await fixture()
  const quickRecords = new QuickRecordService({ dataDirectory })
  const routines = new RoutineService({ dataDirectory, quickRecords })
  const tokens = new TokenService('daily-local-adapter-test', 3600_000)
  const handlers = []
  const server = createServer((request, response) => {
    let index = 0; const next = () => { const handler = handlers[index++]; if (handler) void handler(request, response, next); else { response.statusCode = 404; response.end() } }; next()
  })
  const mock = { httpServer: server, config: { logger: { warn() {}, error() {} } }, middlewares: { use(handler) { handlers.push(handler) } } }
  routinesApiPlugin({ dataDirectory, service: routines, tokens }).configureServer(mock)
  quickRecordsApiPlugin({ dataDirectory, service: quickRecords, routines, tokens }).configureServer(mock)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const request = (url, method = 'GET', body, owner = 'owner') => fetch(base + url, { method, headers: { Authorization: `Bearer ${tokens.create({ id: owner })}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  try {
    const route = `/api/routines/${member.id}/daily`
    assert.deepEqual(await (await request(route)).json(), [])
    const result = await request('/api/quick-records', 'POST', { memberId: member.id, title: '早奶', content: '150毫升', occurredAt: new Date().toISOString(), inputChannel: 'text', idempotencyKey: 'development_atomic_request', journal: dailySnapshot('feeding', input.slots[0].fields), dailySettings: input })
    assert.equal(result.status, 201); const saved = await result.json()
    assert.equal((await (await request(route)).json()).length, 1)
    assert.equal((await request(route, 'GET', undefined, 'intruder')).status, 404)
    assert.equal(await (await request(`${route}/source/${saved.recordId}`)).json(), null)
    await routines.daily.materialize(new Date(Date.now() + 2 * 86400000))
    const day = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
    const instances = await (await request(`${route}/instances?day=${day}`)).json()
    assert.equal(instances.length, 3)
    const skipped = await request(`${route}/instances/${instances[0].id}`, 'POST', { action: 'skip' })
    // It is still tomorrow in the actual dev server; generated fixture entries
    // cannot be treated as already happened by the HTTP confirmation adapter.
    assert.equal(skipped.status, 400)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

async function fixture() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-daily-'))
  const members = new FamilyMemberRepository(dataDirectory)
  const member = await members.create({ accountId: 'owner', name: '验收', relationship: 'child' })
  const writes = []
  const quickRecords = { create: async (_owner, input) => { writes.push(input); return { eventId: 'event-1', recordId: 'record-1', idempotent: false } } }
  const routine = new RoutineService({ dataDirectory, members, quickRecords })
  const input = { kind: 'feeding', revision: 0, enabled: true, timeZone: 'Asia/Shanghai', slots: ['07:30', '13:00', '21:00'].map((time, i) => ({ id: `stable_slot_${i}`, name: ['早奶', '午奶', '晚奶'][i], time, enabled: true, fields: { feedingMethod: 'formula', bottleMl: [150, 180, 200][i] } })) }
  return { routine, member, input, writes, dataDirectory }
}
test('next local day only, exact quantities, no true facts before confirmation; retry and restart unique', async () => {
  const { routine, member, input, writes, dataDirectory } = await fixture()
  const daily = routine.daily
  const saved = await daily.saveSettings('owner', member.id, input, new Date('2026-10-07T15:00:00Z'))
  assert.equal(saved.effectiveFrom, '2026-10-08')
  await daily.materialize(new Date('2026-10-07T15:50:00Z'))
  assert.equal((await daily.instances('owner', member.id, '2026-10-07')).length, 0)
  await Promise.all([daily.materialize(new Date('2026-10-08T14:00:00Z')), daily.materialize(new Date('2026-10-08T14:00:00Z'))])
  const instances = await daily.instances('owner', member.id, '2026-10-08')
  assert.equal(instances.length, 3); assert.equal(writes.length, 0)
  assert.deepEqual(instances.map(item => item.journal.diet.bottleMl), [200, 180, 150])
  assert(instances.every(item => item.status === 'unconfirmed'))
  const restarted = new RoutineService({ dataDirectory, members: routine.members, quickRecords: routine.quickRecords })
  await restarted.daily.materialize(new Date('2026-10-08T14:00:00Z'))
  assert.equal((await restarted.daily.instances('owner', member.id, '2026-10-08')).length, 3)
  await daily.act('owner', member.id, instances[0].id, { action: 'confirm' }, new Date('2026-10-08T14:00:00Z'))
  await daily.act('owner', member.id, instances[0].id, { action: 'confirm' }, new Date('2026-10-08T14:00:00Z'))
  assert.equal(writes.length, 1)
  await assert.rejects(daily.instances('intruder', member.id, '2026-10-08'), /未找到/)
})
test('pause stops future due instances; resume does not backfill paused days; history immutable', async () => {
  const { routine, member, input } = await fixture(), daily = routine.daily
  let saved = await daily.saveSettings('owner', member.id, input, new Date('2026-10-07T01:00:00Z'))
  saved = await daily.saveSettings('owner', member.id, { ...input, revision: saved.revision, enabled: false }, new Date('2026-10-08T01:00:00Z'))
  await daily.materialize(new Date('2026-10-10T15:00:00Z'))
  assert.equal((await daily.instances('owner', member.id, '2026-10-09')).length, 0)
  await daily.saveSettings('owner', member.id, { ...input, revision: saved.revision }, new Date('2026-10-10T01:00:00Z'))
  await daily.materialize(new Date('2026-10-11T15:00:00Z'))
  assert.equal((await daily.instances('owner', member.id, '2026-10-10')).length, 0)
  assert.equal((await daily.instances('owner', member.id, '2026-10-11')).length, 3)
})
test('record and new rule transaction rolls back together; optimistic conflict and request retry', async () => {
  const { routine, member, input } = await fixture()
  routine.quickRecords.create = async () => { throw new Error('模拟保存失败') }
  const request = { memberId: member.id, idempotencyKey: 'request_123456', dailySettings: input, journal: dailySnapshot('feeding', input.slots[0].fields) }
  await assert.rejects(routine.daily.saveWithRecord('owner', { ...request, journal: dailySnapshot('bowel', {}) }), /对应本次记录类型/)
  await assert.rejects(routine.daily.saveWithRecord('owner', request), /模拟保存失败/)
  assert.deepEqual(await routine.daily.settings('owner', member.id), [])
  await routine.daily.saveSettings('owner', member.id, input)
  await assert.rejects(routine.daily.saveSettings('owner', member.id, input), error => error.status === 409)
})
test('whitelist observations and safe medication boundaries; zone conversion and DST', () => {
  const milk = dailySnapshot('feeding', { feedingMethod: 'formula', bottleMl: 150, reactions: ['皮肤'], photoIds: ['unsafe'] })
  assert.deepEqual(milk.diet, { kind: 'feeding', feedingMethod: 'formula', bottleMl: 150 })
  assert.deepEqual(dailySnapshot('bowel', { shapes: ['水样'], color: '红色' }).bowel, { shapes: [], observations: [] })
  assert.throws(() => dailySnapshot('medication', { mode: 'as_needed' }), /按需/)
  assert.throws(() => dailySnapshot('medication', { mode: 'fixed', medicationName: '用户已填写药物', amountValue: 1, amountUnit: '毫升' }), /结束日期/)
  assert.throws(() => dailySnapshot('medication', { mode: 'fixed', medicationName: '用户已填写药物', amountValue: 1, amountUnit: '毫升', endDate: '2026-02-30' }), /结束日期/)
  assert.equal(zonedInstant('2026-10-08', '07:30', 'Asia/Shanghai'), '2026-10-07T23:30:00.000Z')
  assert.equal(zonedInstant('2026-03-08', '02:30', 'America/New_York'), null)
})
test('separate scheduler processes race on the database unique key without duplicate proposals', async () => {
  const { routine, member, input, dataDirectory } = await fixture()
  await routine.daily.saveSettings('owner', member.id, input, new Date('2026-10-07T01:00:00Z'))
  const code = `import { RoutineService } from './server/routines/routine-service.mjs'; await new RoutineService({dataDirectory:${JSON.stringify(dataDirectory)}}).daily.materialize(new Date('2026-10-08T14:00:00Z'))`
  await Promise.all(Array.from({ length: 3 }, () => promisify(execFile)(process.execPath, ['--input-type=module', '-e', code])))
  assert.equal((await routine.daily.instances('owner', member.id, '2026-10-08')).length, 3)
})
test('real facts isolated until confirmation, adjustment only this instance, link crash retry and explicit manual association', async () => {
  const { member, input, dataDirectory } = await fixture()
  const quickRecords = new QuickRecordService({ dataDirectory })
  const daily = new RoutineService({ dataDirectory, quickRecords }).daily
  const now = new Date('2026-10-08T14:00:00Z')
  await daily.saveSettings('owner', member.id, input, new Date('2026-10-07T01:00:00Z'))
  await daily.materialize(now)
  assert.equal((await quickRecords.records.repository.findByAccountId('owner')).length, 0)
  assert.equal((await quickRecords.events.repository.findByAccountId('owner')).length, 0)
  const items = await daily.instances('owner', member.id, '2026-10-08')
  const originalLink = daily.link.bind(daily)
  daily.link = async () => { throw new Error('link interrupted after actual commit') }
  await assert.rejects(daily.act('owner', member.id, items[0].id, { action: 'confirm', fields: { feedingMethod: 'formula', bottleMl: 190 } }, now), error => error.code === 'DAILY_LINK_PENDING')
  assert.equal((await quickRecords.records.repository.findByAccountId('owner')).length, 1)
  daily.link = originalLink
  const confirmed = await daily.act('owner', member.id, items[0].id, { action: 'confirm' }, now)
  assert.equal((await quickRecords.records.repository.findByAccountId('owner')).length, 1)
  assert.equal((await quickRecords.records.repository.findById(confirmed.recordId)).journal.diet.bottleMl, 190)
  assert.equal((await daily.settings('owner', member.id))[0].slots[2].fields.bottleMl, 200)
  assert.equal((await daily.source('owner', member.id, confirmed.recordId)).id, items[0].id)
  await assert.rejects(daily.saveWithRecord('owner', { memberId: member.id, title: 'manual', content: 'manual', occurredAt: now.toISOString(), inputChannel: 'text', idempotencyKey: 'manual_link_conflict', journal: dailySnapshot('feeding', { feedingMethod: 'formula', bottleMl: 100 }), automaticInstanceId: items[0].id }, now), /已关联/)
  assert.equal((await quickRecords.records.repository.findByAccountId('owner')).length, 1)
  await daily.act('owner', member.id, items[1].id, { action: 'skip' }, now)
  await assert.rejects(daily.act('owner', member.id, items[1].id, { action: 'confirm' }, now), /未发生/)
  const manual = { memberId: member.id, title: '早奶', content: '早奶实际喝了160毫升', occurredAt: items[2].plannedAt, inputChannel: 'text', idempotencyKey: 'manual_explicit_link', journal: dailySnapshot('feeding', { feedingMethod: 'formula', bottleMl: 160 }), automaticInstanceId: items[2].id }
  const linked = await daily.saveWithRecord('owner', manual, now)
  await daily.saveWithRecord('owner', manual, now)
  assert.equal((await quickRecords.records.repository.findByAccountId('owner')).length, 2)
  assert.equal((await daily.instance('owner', member.id, items[2].id)).recordId, linked.recordId)
})
test('all types whitelist observations; fixed medication expires; pauses/removal preserve existing instances', async () => {
  const { routine, member, input } = await fixture()
  const day = new Date('2026-10-07T01:00:00Z'), later = new Date('2026-10-08T14:00:00Z')
  let saved = await routine.daily.saveSettings('owner', member.id, input, day)
  await routine.daily.materialize(new Date('2026-10-08T00:00:00Z'))
  saved = await routine.daily.saveSettings('owner', member.id, { ...saved, slots: saved.slots.slice(0, 1) }, new Date('2026-10-08T01:00:00Z'))
  await routine.daily.materialize(later)
  assert.equal((await routine.daily.instances('owner', member.id, '2026-10-08')).length, 1)
  for (const [kind, fields] of [ ['complementary', { foods: '米糊' }], ['meal', { foods: '米饭' }], ['snack', { foods: '苹果' }], ['supplement', { names: '用户指定补剂', amount: '1', unit: '滴' }], ['topical', { kind: 'skincare', productName: '用户指定护肤品' }], ['sleep', { kind: 'night', endTime: '07:00' }], ['medication', { mode: 'fixed', medicationName: '用户指定药物', amountValue: 1, amountUnit: '毫升', endDate: '2026-10-08' }] ]) {
    await routine.daily.saveSettings('owner', member.id, { ...input, kind, slots: [{ ...input.slots[0], fields: { ...fields, photos: ['unsafe'], symptoms: 'unsafe' } }] }, day)
  }
  await routine.daily.materialize(new Date('2026-10-09T14:00:00Z'))
  const previous = await routine.daily.instances('owner', member.id, '2026-10-08')
  assert.equal(previous.length, 8)
  assert(previous.every(item => !('photos' in item.fields) && !('symptoms' in item.fields)))
  assert(!(await routine.daily.instances('owner', member.id, '2026-10-09')).some(item => item.kind === 'medication'))
  assert.throws(() => dailySnapshot('feeding', { feedingMethod: {} }), /字段无效/)
})
test('guest merge preserves proposal identity and account deletion removes only the owned daily data', async () => {
  const { routine, member, input, dataDirectory } = await fixture()
  const guestId = 'guest:daily-test', newOwner = 'registered-owner'
  const guestMember = await routine.members.create({ accountId: guestId, name: '访客验收', relationship: 'child' })
  await routine.daily.saveSettings('owner', member.id, input, new Date('2026-10-07T01:00:00Z'))
  await routine.daily.saveSettings(guestId, guestMember.id, input, new Date('2026-10-07T01:00:00Z'))
  await routine.daily.materialize(new Date('2026-10-08T14:00:00Z'))
  const original = await routine.daily.instances(guestId, guestMember.id, '2026-10-08')
  const accounts = new AccountDataService({ dataDirectory })
  await accounts.mergeGuest(guestId, newOwner)
  assert.deepEqual((await routine.daily.instances(newOwner, guestMember.id, '2026-10-08')).map(item => item.id), original.map(item => item.id))
  await routine.daily.materialize(new Date('2026-10-08T14:00:00Z'))
  assert.equal((await routine.daily.instances(newOwner, guestMember.id, '2026-10-08')).length, 3)
  await assert.rejects(routine.daily.instances(guestId, guestMember.id, '2026-10-08'), /未找到/)
  await accounts.deleteAccount(newOwner)
  const db = await routine.daily.database()
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM instances WHERE member_id=?').get(guestMember.id).n, 0)
  assert.equal((await routine.daily.instances('owner', member.id, '2026-10-08')).length, 3)
})
test('sleep confirmation never treats a usual wake clock as actual; explicit cross-midnight completion is one fact', async () => {
  const { member, input, dataDirectory } = await fixture()
  const quickRecords = new QuickRecordService({ dataDirectory }), routine = new RoutineService({ dataDirectory, quickRecords })
  const next = await routine.members.create({ accountId: 'owner', name: '另一睡眠验收', relationship: 'child' })
  const sleepRule = { ...input, kind: 'sleep', slots: [{ ...input.slots[0], time: '21:10', name: '夜间睡眠', fields: { kind: 'night', endTime: '07:00' } }] }
  for (const child of [member, next]) await routine.daily.saveSettings('owner', child.id, sleepRule, new Date('2026-10-07T01:00:00Z'))
  const now = new Date('2026-10-09T01:00:00Z')
  await routine.daily.materialize(now)
  const first = (await routine.daily.instances('owner', member.id, '2026-10-08'))[0]
  const ongoing = await routine.daily.act('owner', member.id, first.id, { action: 'confirm' }, now)
  const journal = (await quickRecords.records.repository.findById(ongoing.recordId)).journal
  assert.equal(journal.sleep.status, 'ongoing'); assert.equal(journal.sleep.wakeAt, undefined); assert.equal(journal.sleep.durationMinutes, undefined)
  const second = (await routine.daily.instances('owner', next.id, '2026-10-08'))[0]
  const done = await routine.daily.act('owner', next.id, second.id, { action: 'confirm', sleepStatus: 'completed', wakeAt: '2026-10-08T23:00:00Z' }, now)
  const actual = await quickRecords.records.repository.findById(done.recordId)
  assert.equal(actual.journal.sleep.status, 'completed'); assert.equal(actual.journal.sleep.durationMinutes, 590)
  assert.equal(actual.occurredAt, '2026-10-08T23:00:00.000Z')
  assert.equal((await quickRecords.records.repository.findByAccountId('owner')).length, 2)
})

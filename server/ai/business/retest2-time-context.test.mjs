import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FamilyMemberRepository } from '../../members/repositories/family-member-repository.mjs'
import { AIBusinessService } from './service.mjs'
import { resolveItemTime } from './contract.mjs'
import { TimeResolverService } from '../time-resolver-service.mjs'

const now = new Date('2026-10-18T10:00:00Z')
const options = { referenceNow: now, timezone: 'Asia/Shanghai' }
for (const [input, expected] of [
  ['2026-01-01 10:01:59Z', '2026-01-01T10:01:59.000Z'],
  ['2026-01-01 10:01:59+05:45', '2026-01-01T04:16:59.000Z'],
  ['2026-01-01 10:01:59-0330', '2026-01-01T13:31:59.000Z'],
  ['2026-01-01 10:01:59.123', '2026-01-01T02:01:59.123Z'],
  ['2026-01-01T10:01:59.456', '2026-01-01T02:01:59.456Z'],
  ['2026-01-01T10:01:59.123Z', '2026-01-01T10:01:59.123Z'],
  ['2026-01-01t10:01:59.123+05:45', '2026-01-01T04:16:59.123Z'],
  ['2026-01-01t10:01:59.123z', '2026-01-01T10:01:59.123Z'],
  ['2026/1/1 10:01:59.123+05:45', '2026-01-01T04:16:59.123Z'],
  ['2026/1/1 1:01:59.456', '2025-12-31T17:01:59.456Z'],
]) {
  test(`time resolver preserves offset and milliseconds: ${input}`, () => {
    assert.equal(resolveItemTime({ timeText: input }, options).resolvedStart, expected)
    assert.equal(new TimeResolverService().resolve(input, options).resolvedStart, expected)
  })
}
test('malformed numeric instants cannot fall through to partial date/clock parsing', () => {
  for (const timeText of ['2026-02-30 10:00Z', '2026-02-30 10:00', '2026-01-01 25:00', '2026-01-01 10:00:00.xyzZ']) {
    assert.throws(() => resolveItemTime({ timeText }, options), { code: 'INVALID_OCCURRED_AT' })
  }
  assert.throws(() => resolveItemTime({ timeText: '2026-03-08 02:30' }, { ...options, timezone: 'America/New_York' }), { code: 'INVALID_OCCURRED_AT' })
})

async function fixture(t, timeText = '2026-01-01 10:00') {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-time-context-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const account = 'synthetic-time-context'
  const member = await new FamilyMemberRepository(dataDirectory).create({ accountId: account, name: '虚构人物', relationship: 'self' })
  let calls = 0
  const model = { async structured() {
    calls++
    return { value: { items: [{ category: 'other', title: '体检资料', subject: 'current', timeText, archiveCategory: null, relationKey: null, fields: [{ name: 'conclusion', value: '体检资料', quote: '体检资料', sourceId: 'input', page: 1 }] }] }, diagnostics: { provider: 'local-fixture' } }
  } }
  const config = { dataDirectory, now: () => now, model, logger: { info() {}, warn() {} } }
  const service = new AIBusinessService(config)
  return { account, member, service, config, calls: () => calls }
}

test('explicit timezone changes invalidate cached drafts and persist the newly resolved instant', async t => {
  const f = await fixture(t)
  const input = { text: '2026-01-01 10:00 体检资料', smartRecord: true }
  const first = await f.service.prepare(f.account, f.member.id, { ...input, timezone: 'Asia/Shanghai' })
  const second = await f.service.prepare(f.account, f.member.id, { ...input, id: first.id, version: first.version, timezone: 'UTC' })
  assert.equal(first.items[0].time.resolvedStart, '2026-01-01T02:00:00.000Z')
  assert.equal(second.items[0].time.resolvedStart, '2026-01-01T10:00:00.000Z')
  assert.equal((await f.service.get(f.account, f.member.id, second.id)).timezone, 'UTC')
  const cached = await f.service.prepare(f.account, f.member.id, { ...input, id: second.id, version: second.version, timezone: 'Etc/UTC' })
  assert.equal(cached.version, second.version)
  assert.equal(f.calls(), 2)
  const saved = await f.service.save(f.account, f.member.id, cached.id, { version: cached.version, confirmed: true })
  const record = await f.service.records.getOwnedRecord(f.account, saved.result.records[0].recordId)
  assert.equal(record.occurredAt, '2026-01-01T10:00:00.000Z')
})

test('implicit draft lookup respects timezone and invalid timezone input does not mutate the original', async t => {
  const f = await fixture(t)
  const input = { text: '2026-01-01 10:00 体检资料', smartRecord: true }
  const first = await f.service.prepare(f.account, f.member.id, { ...input, timezone: 'Asia/Shanghai' })
  const second = await f.service.prepare(f.account, f.member.id, { ...input, timezone: 'UTC' })
  assert.notEqual(first.id, second.id)
  assert.equal(second.items[0].time.resolvedStart, '2026-01-01T10:00:00.000Z')
  const before = await f.service.get(f.account, f.member.id, first.id)
  await assert.rejects(f.service.prepare(f.account, f.member.id, { ...input, id: first.id, version: first.version, timezone: 'invalid/timezone' }), { code: 'INVALID_TIMEZONE' })
  assert.deepEqual(await f.service.get(f.account, f.member.id, first.id), before)
})

test('concurrent legacy single edits across service instances retain the successful edit and reject the stale version', async t => {
  const f = await fixture(t)
  const d = await f.service.prepare(f.account, f.member.id, { text: '2026-01-01 10:00 体检资料', smartRecord: true })
  const second = new AIBusinessService(f.config)
  const changes = [{ field: 'title', value: '家长核对资料' }, { field: 'conclusion', value: '手动核对原话' }]
  const results = await Promise.allSettled([f.service, second].map((service, i) => service.edit(f.account, f.member.id, d.id, { version: d.version, itemId: d.items[0].id, ...changes[i] })))
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1)
  assert.equal(results.find(x => x.status === 'rejected').reason.status, 409)
  const current = await second.read(f.account, f.member.id, d.id)
  const success = results.find(x => x.status === 'fulfilled').value
  assert.equal(current.version, d.version + 1)
  assert.deepEqual(current.items, success.items)
})

test('manual date editing persists exact offset and subsecond precision', async t => {
  const f = await fixture(t)
  const d = await f.service.prepare(f.account, f.member.id, { text: '2026-01-01 10:00 体检资料', smartRecord: true })
  const edited = await f.service.edit(f.account, f.member.id, d.id, { version: d.version, itemId: d.items[0].id, field: 'time', value: '2026-01-01 10:01:59.123+05:45' })
  const saved = await f.service.save(f.account, f.member.id, d.id, { version: edited.version, confirmed: true })
  assert.equal((await f.service.records.getOwnedRecord(f.account, saved.result.records[0].recordId)).occurredAt, '2026-01-01T04:16:59.123Z')
})

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { HealthEventRecordService } from './health-event-record-service.mjs'
import { HealthEventRepository } from './repositories/health-event-repository.mjs'
import { HealthEventService } from './health-event-service.mjs'
import { QuickRecordService } from './quick-record-service.mjs'

const now = new Date('2026-09-16T12:00:00.000Z')
const continuousJournal = (overrides = {}) => ({
  categories: ['symptom'],
  continuous: { kind: 'description', relation: 'initial', timePrecision: 'unknown', ...overrides }
})

test('manual continuous records keep uncertainty and make repeated operation ids idempotent', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-continuous-'))
  try {
    const events = new HealthEventRepository(dataDirectory)
    const service = new HealthEventRecordService({ dataDirectory, events, organizations: { invalidateAndRecompute: async () => undefined }, changeAnnotations: { recompute: async () => undefined } })
    const event = await events.create({ accountId: 'account', memberId: 'child', title: '皮肤变化', category: 'other', status: 'observing', startTime: now.toISOString() }, now)
    const input = { type: 'note', content: '不确定是不是痒，没有看到疹子', occurredAt: now.toISOString(), sourceType: 'text_record', operationId: 'stable-operation-one', journal: continuousJournal() }
    const first = await service.create('account', event.id, input, now)
    const repeated = await service.create('account', event.id, input, now)
    assert.equal(repeated.id, first.id)
    assert.equal((await service.list('account', event.id)).length, 1)
    assert.equal(first.content, input.content)
    assert.equal(first.journal.continuous.timePrecision, 'unknown')
  } finally { await rm(dataDirectory, { recursive: true, force: true }) }
})

test('manual continuous related records are restricted to the same member', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-continuous-links-'))
  try {
    const events = new HealthEventRepository(dataDirectory)
    const service = new HealthEventRecordService({ dataDirectory, events, organizations: { invalidateAndRecompute: async () => undefined }, changeAnnotations: { recompute: async () => undefined } })
    const target = await events.create({ accountId: 'account', memberId: 'child-a', title: '目标', category: 'other', status: 'observing', startTime: now.toISOString() }, now)
    const sameMemberEvent = await events.create({ accountId: 'account', memberId: 'child-a', title: '饮食', category: 'other', status: 'observing', startTime: now.toISOString() }, now)
    const otherMemberEvent = await events.create({ accountId: 'account', memberId: 'child-b', title: '其他孩子', category: 'other', status: 'observing', startTime: now.toISOString() }, now)
    const same = await service.create('account', sameMemberEvent.id, { type: 'note', content: '吃了苹果', occurredAt: now.toISOString(), journal: { categories: ['diet'] } }, now)
    const other = await service.create('account', otherMemberEvent.id, { type: 'note', content: '喝了牛奶', occurredAt: now.toISOString(), journal: { categories: ['diet'] } }, now)
    const linked = await service.create('account', target.id, { type: 'note', content: '脸有点红', occurredAt: now.toISOString(), operationId: 'stable-operation-two', journal: continuousJournal({ relatedRecordIds: [same.id, same.id] }) }, now)
    assert.deepEqual(linked.journal.continuous.relatedRecordIds, [same.id])
    const concurrent = await service.create('account', sameMemberEvent.id, { type: 'note', content: '之后喝了水', occurredAt: now.toISOString(), journal: { categories: ['diet'] } }, now)
    await service.repository.update(linked.id, { journal: continuousJournal({ relatedRecordIds: [same.id, concurrent.id] }) }, now)
    const merged = await service.replaceContinuousRelations('account', target.id, { rootRecordId: linked.id, baseRelatedRecordIds: [same.id], relatedRecordIds: [] }, now)
    assert.deepEqual(merged.journal.continuous.relatedRecordIds, [concurrent.id])
    await assert.rejects(() => service.create('account', target.id, { type: 'note', content: '错误关联', occurredAt: now.toISOString(), operationId: 'stable-operation-three', journal: continuousJournal({ relatedRecordIds: [other.id] }) }, now), (error) => error.code === 'INVALID_RELATED_RECORD')
  } finally { await rm(dataDirectory, { recursive: true, force: true }) }
})

test('approximate time requires original wording and a stable reference instant', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-continuous-time-'))
  try {
    const events = new HealthEventRepository(dataDirectory)
    const service = new HealthEventRecordService({ dataDirectory, events, organizations: { invalidateAndRecompute: async () => undefined }, changeAnnotations: { recompute: async () => undefined } })
    const event = await events.create({ accountId: 'account', memberId: 'child', title: '时间语义', category: 'other', status: 'observing', startTime: now.toISOString() }, now)
    const record = await service.create('account', event.id, { type: 'note', content: '今天晚上发现有点红', occurredAt: now.toISOString(), operationId: 'stable-operation-four', journal: continuousJournal({ timePrecision: 'approx', timeExpression: '今天晚上', timeReferenceAt: now.toISOString() }) }, now)
    assert.equal(record.journal.continuous.timeExpression, '今天晚上')
    assert.equal(record.journal.continuous.timeReferenceAt, now.toISOString())
    await assert.rejects(() => service.create('account', event.id, { type: 'note', content: '大概以前', occurredAt: now.toISOString(), operationId: 'stable-operation-five', journal: continuousJournal({ timePrecision: 'approx', timeExpression: '以前某次' }) }, now), (error) => error.code === 'INVALID_CONTINUOUS_RECORD')
  } finally { await rm(dataDirectory, { recursive: true, force: true }) }
})

test('targeted quick record appends once to the same situation without changing status', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-continuous-append-'))
  try {
    const eventRepository = new HealthEventRepository(dataDirectory)
    const events = new HealthEventService({ dataDirectory, repository: eventRepository })
    const records = new HealthEventRecordService({ dataDirectory, events: eventRepository, organizations: { invalidateAndRecompute: async () => undefined }, changeAnnotations: { recompute: async () => undefined } })
    const quick = new QuickRecordService({ dataDirectory, events, records })
    const event = await eventRepository.create({ accountId: 'account', memberId: 'child', title: '连续情况', category: 'other', status: 'observing', startTime: now.toISOString() }, now)
    const root = await records.create('account', event.id, { type: 'note', content: '最初有点红', occurredAt: now.toISOString(), operationId: 'stable-root-operation', journal: continuousJournal() }, now)
    const input = { memberId: 'child', content: '后来更明显一些', rawText: '后来更明显一些', occurredAt: now.toISOString(), inputChannel: 'text', idempotencyKey: 'stable-followup-operation', title: '连续情况', targetEventId: event.id, rootRecordId: root.id, journal: continuousJournal({ relation: 'follow_up', rootRecordId: root.id }) }
    const first = await quick.create('account', input, now)
    const repeated = await quick.create('account', input, now)
    assert.equal(first.eventId, event.id)
    assert.equal(repeated.recordId, first.recordId)
    const saved = await records.list('account', event.id)
    assert.equal(saved.length, 2)
    assert.equal(saved[1].note, `event-update:${root.id}`)
    assert.equal((await eventRepository.findById(event.id)).status, 'observing')
    assert.deepEqual(await quick.status('account', input.idempotencyKey, 'child'), { status: 'completed', eventId: event.id, recordId: first.recordId })
    assert.deepEqual(await quick.status('account', 'missing-operation-id', 'child'), { status: 'not_found' })
    assert.deepEqual(await quick.status('account', input.idempotencyKey, 'other-child'), { status: 'not_found' })
  } finally { await rm(dataDirectory, { recursive: true, force: true }) }
})

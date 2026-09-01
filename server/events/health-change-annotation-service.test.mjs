import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { computeHealthChangeAnnotations } from './health-change-annotation-service.mjs'
import { HealthEventRecordService } from './health-event-record-service.mjs'
import { HealthEventRecordRepository } from './repositories/health-event-record-repository.mjs'
import { HealthEventRepository } from './repositories/health-event-repository.mjs'

const record = (id, content, day, eventId = 'event-one') => ({
  id, accountId: 'account-one', eventId, type: 'symptom', content,
  occurredAt: `2026-08-${String(day).padStart(2, '0')}T12:00:00.000Z`,
  createdAt: `2026-08-${String(day).padStart(2, '0')}T12:01:00.000Z`, updatedAt: `2026-08-${String(day).padStart(2, '0')}T12:01:00.000Z`
})

const visible = (map, id) => (map.get(id) ?? []).filter((item) => !item.hidden).map(({ factLabel, changeType, comparedRecordId }) => ({ factLabel, changeType, comparedRecordId }))

test('明确连续变化生成新出现、加重、减轻和已消失并保留比较来源', () => {
  const records = [
    record('r1', '今天第一次开始咳嗽', 1),
    record('r2', '晚上咳嗽比昨天严重', 2),
    record('r3', '今天咳嗽轻了一些', 3),
    record('r4', '今天已经不咳了', 4)
  ]
  const changes = computeHealthChangeAnnotations(records, new Date('2026-09-01T00:00:00.000Z'))
  assert.deepEqual(visible(changes, 'r1'), [{ factLabel: '咳嗽', changeType: 'new', comparedRecordId: null }])
  assert.deepEqual(visible(changes, 'r2'), [{ factLabel: '咳嗽', changeType: 'worsened', comparedRecordId: 'r1' }])
  assert.deepEqual(visible(changes, 'r3'), [{ factLabel: '咳嗽', changeType: 'improved', comparedRecordId: 'r2' }])
  assert.deepEqual(visible(changes, 'r4'), [{ factLabel: '咳嗽', changeType: 'resolved', comparedRecordId: 'r3' }])
})

test('一条记录可以生成多个标签，但持续、无历史否定和不可靠语句不生成', () => {
  const changes = computeHealthChangeAnnotations([
    record('r1', '昨天有咳嗽', 1),
    record('r2', '咳嗽比昨天严重，今天开始鼻塞', 2),
    record('r3', '还是咳嗽', 3),
    record('r4', '今天没有腹泻', 4),
    record('r5', '担心咳嗽会加重', 5),
    record('r6', '如果加重就去医院', 6),
    record('r7', '医生说如果咳嗽加重就复诊', 7),
    record('r8', '妈妈说她自己头痛加重，但孩子没事', 8),
    record('r9', '可能咳嗽好一点', 9)
  ])
  assert.deepEqual(visible(changes, 'r2'), [
    { factLabel: '咳嗽', changeType: 'worsened', comparedRecordId: 'r1' },
    { factLabel: '鼻塞', changeType: 'new', comparedRecordId: null }
  ])
  for (const id of ['r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9']) assert.deepEqual(visible(changes, id), [])
})

test('修改时间、删除比较记录后统一重算，且用户纠正和删除刷新后仍优先', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-health-changes-'))
  const events = new HealthEventRepository(dataDirectory)
  const repository = new HealthEventRecordRepository(dataDirectory)
  const service = new HealthEventRecordService({
    dataDirectory, events, repository,
    organizations: { invalidateAndRecompute: async () => undefined }
  })
  try {
    const event = await events.create({ accountId: 'account-one', memberId: 'member-one', title: '咳嗽', category: 'other', status: 'ongoing', startTime: '2026-08-01T00:00:00.000Z' })
    const first = await service.create('account-one', event.id, { type: 'symptom', content: '今天开始咳嗽', occurredAt: '2026-08-01T12:00:00.000Z' }, new Date('2026-09-01T00:00:00.000Z'))
    const second = await service.create('account-one', event.id, { type: 'symptom', content: '咳嗽比昨天严重', occurredAt: '2026-08-02T12:00:00.000Z' }, new Date('2026-09-01T00:00:00.000Z'))
    assert.equal(second.changeAnnotations[0].changeType, 'worsened')
    assert.equal(second.changeAnnotations[0].comparedRecordId, first.id)

    const manuallyChanged = await service.updateChangeAnnotation('account-one', second.id, second.changeAnnotations[0].id, { changeType: 'improved' })
    assert.equal(manuallyChanged.changeAnnotations[0].source, 'user')
    assert.equal(manuallyChanged.changeAnnotations[0].changeType, 'improved')
    await service.changeAnnotations.recompute('account-one', event.id)
    assert.equal((await repository.findById(second.id)).changeAnnotations[0].changeType, 'improved')

    await service.deleteChangeAnnotation('account-one', second.id, second.changeAnnotations[0].id)
    await service.changeAnnotations.recompute('account-one', event.id)
    assert.equal((await repository.findById(second.id)).changeAnnotations[0].hidden, true)

    const third = await service.create('account-one', event.id, { type: 'symptom', content: '今天咳嗽轻了一些', occurredAt: '2026-08-03T12:00:00.000Z' }, new Date('2026-09-01T00:00:00.000Z'))
    assert.equal(third.changeAnnotations[0].comparedRecordId, second.id)
    await service.delete('account-one', second.id)
    assert.equal((await repository.findById(third.id)).changeAnnotations[0].comparedRecordId, first.id)
    await service.update('account-one', third.id, { occurredAt: '2026-07-31T12:00:00.000Z' }, new Date('2026-09-01T00:00:00.000Z'))
    assert.equal((await repository.findById(third.id)).changeAnnotations.length, 0)
  } finally {
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

test('不同事件的相似症状不会互相比较，旧记录缺少字段保持兼容', () => {
  const firstEvent = computeHealthChangeAnnotations([record('r1', '今天有咳嗽', 1, 'event-one')])
  const secondEvent = computeHealthChangeAnnotations([record('r2', '咳嗽比昨天严重', 2, 'event-two')])
  assert.deepEqual(visible(firstEvent, 'r1'), [])
  assert.deepEqual(visible(secondEvent, 'r2'), [])
})

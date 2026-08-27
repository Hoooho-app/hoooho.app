import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { OnlineConsultationService } from './online-consultation-service.mjs'

test('在线问诊状态、问答历史和医生交代按账号与事件持久化', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-online-consultation-'))
  const events = new HealthEventRepository(dataDirectory)
  const records = new HealthEventRecordRepository(dataDirectory)
  const now = new Date('2026-08-27T02:00:00.000Z')
  try {
    const event = await events.create({
      accountId: 'account-1', memberId: 'member-1', title: '发热', category: 'fever', status: 'observing', startTime: '2026-08-26T02:00:00.000Z'
    }, now)
    const service = new OnlineConsultationService({ dataDirectory })
    const initial = await service.get('account-1', event.id, now)
    assert.equal(initial.status, 'preparing')
    const concurrent = await Promise.all([service.get('account-1', event.id, now), service.get('account-1', event.id, now)])
    assert.equal(concurrent[0].id, concurrent[1].id)

    const waiting = await service.updateStatus('account-1', event.id, { status: 'waiting' }, new Date('2026-08-27T02:01:00.000Z'))
    assert.equal(waiting.status, 'waiting')
    const questioned = await service.addQuestion('account-1', event.id, {
      question: '有没有做过血常规？', reply: '相关检查情况还没有记录。', missing: ['相关检查情况还没有记录'], sources: [], supplements: []
    }, new Date('2026-08-27T02:02:00.000Z'))
    assert.equal(questioned.status, 'doctor_questions')
    assert.equal(questioned.questions.length, 1)

    await assert.rejects(() => service.get('account-2', event.id), (error) => error.code === 'HEALTH_EVENT_NOT_FOUND')

    const completed = await service.complete('account-1', event.id, { finalDoctorInstructions: '继续补水，体温升高时复诊。' }, new Date('2026-08-27T02:03:00.000Z'))
    assert.equal(completed.status, 'completed')
    assert.ok(completed.finalRecordId)
    const saved = await records.findByEventId(event.id)
    assert.equal(saved.length, 1)
    assert.equal(saved[0].content, '在线医生回复：继续补水，体温升高时复诊。')

    const retried = await service.complete('account-1', event.id, { finalDoctorInstructions: '继续补水，体温升高时复诊。' }, new Date('2026-08-27T02:04:00.000Z'))
    assert.equal(retried.finalRecordId, completed.finalRecordId)
    assert.equal((await records.findByEventId(event.id)).length, 1)
  } finally {
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { AccountEntryStateService } from './account-entry-state-service.mjs'

test('入口状态区分空事件与账户级持久化健康记录，并独立统计现存成员', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-entry-state-'))
  const members = new FamilyMemberRepository(dataDirectory)
  const events = new HealthEventRepository(dataDirectory)
  const records = new HealthEventRecordRepository(dataDirectory)
  const service = new AccountEntryStateService({ members, records })
  const accountId = 'account-1'

  try {
    assert.deepEqual(await service.get(accountId), { familyMemberCount: 0, hasValidHealthRecord: false })
    const member = await members.ensureSelf(accountId, new Date('2026-08-28T00:00:00.000Z'))
    const event = await events.create({ accountId, memberId: member.id, title: '', category: 'other', status: 'observing', startTime: '2026-08-28T00:00:00.000Z' }, new Date('2026-08-28T00:00:00.000Z'))
    assert.deepEqual(await service.get(accountId), { familyMemberCount: 1, hasValidHealthRecord: false })
    await records.create({ accountId, eventId: event.id, type: 'note', content: '今天开始咳嗽', occurredAt: '2026-08-28T00:01:00.000Z' }, new Date('2026-08-28T00:01:00.000Z'))
    assert.deepEqual(await service.get(accountId), { familyMemberCount: 1, hasValidHealthRecord: true })
    await members.delete(member.id)
    assert.deepEqual(await service.get(accountId), { familyMemberCount: 0, hasValidHealthRecord: true })
  } finally {
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

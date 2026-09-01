import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { HealthRecordOrganizationRepository } from '../ai/repositories/health-record-organization-repository.mjs'
import { HealthProfileFactService } from './health-profile-fact-service.mjs'

async function fixture() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-profile-fact-'))
  const accountId = 'account-1'
  const members = new FamilyMemberRepository(dataDirectory)
  const events = new HealthEventRepository(dataDirectory)
  const records = new HealthEventRecordRepository(dataDirectory)
  const organizations = new HealthRecordOrganizationRepository(dataDirectory)
  const member = await members.create({ accountId, name: '小禾', relationship: 'self', isSelf: true })
  const event = await events.create({ accountId, memberId: member.id, title: '发热事件', category: 'fever', status: 'observing', startTime: '2026-08-30T09:00:00.000Z' })
  const record = await records.create({ accountId, eventId: event.id, type: 'medication', content: '吃阿莫西林后身上出现红点', occurredAt: '2026-08-30T09:10:00.000Z' })
  const organization = await organizations.upsert({
    accountId,
    eventId: event.id,
    recordId: record.id,
    rawInput: record.content,
    status: 'completed',
    provider: 'test',
    healthAIOutput: {
      confidence: 0.8,
      parserVersion: 'test',
      promptVersion: 'test',
      timeConflict: { hasConflict: false, conflict: null },
      facts: [{
        id: 'fact-1',
        type: 'concern',
        name: '阿莫西林相关反应',
        bodyPart: null,
        sourceText: record.content,
        originalText: record.content,
        time: { raw: null, resolvedStart: record.occurredAt, resolvedEnd: null, precision: 'exact', source: 'selected_time' },
        confidence: 0.8,
        polarity: 'affirmed',
        temporality: 'current',
        status: 'active',
        subject: 'event_subject',
        source: 'user_report'
      }]
    }
  })
  return {
    accountId,
    dataDirectory,
    event,
    member,
    organization,
    service: new HealthProfileFactService({ dataDirectory }),
    cleanup: () => rm(dataDirectory, { recursive: true, force: true })
  }
}

test('候选事实不会自动写入档案，确认加入后保留不可编辑来源', async () => {
  const f = await fixture()
  try {
    const candidates = await f.service.listCandidates(f.accountId, f.member.id)
    assert.equal(candidates.length, 1)
    assert.equal((await f.service.list(f.accountId, f.member.id)).length, 0)
    assert.equal(candidates[0].source.originalText, '吃阿莫西林后身上出现红点')

    const saved = await f.service.create(f.accountId, {
      memberId: f.member.id,
      title: '阿莫西林相关反应',
      category: 'allergy',
      status: 'pending',
      source: { organizationId: f.organization.id, sourceFactId: 'fact-1' }
    })
    assert.equal(saved.status, 'pending')
    assert.equal(saved.sources[0].eventId, f.event.id)
    assert.equal((await f.service.listCandidates(f.accountId, f.member.id)).length, 0)

    const edited = await f.service.update(f.accountId, saved.id, {
      title: '青霉素类药物相关反应',
      status: 'confirmed',
      notes: '就诊时主动告知医生',
      sources: []
    })
    assert.equal(edited.title, '青霉素类药物相关反应')
    assert.equal(edited.status, 'confirmed')
    assert.equal(edited.sources.length, 1)
  } finally {
    await f.cleanup()
  }
})

test('已移除事实保留来源且同一候选不能重复归档', async () => {
  const f = await fixture()
  try {
    const input = {
      memberId: f.member.id,
      category: 'important',
      source: { organizationId: f.organization.id, sourceFactId: 'fact-1' }
    }
    const saved = await f.service.create(f.accountId, input)
    const removed = await f.service.update(f.accountId, saved.id, { status: 'removed' })
    assert.equal(removed.status, 'removed')
    assert.equal(removed.sources[0].originalText, '吃阿莫西林后身上出现红点')
    await assert.rejects(() => f.service.create(f.accountId, input), (error) => error.code === 'HEALTH_PROFILE_SOURCE_EXISTS')
  } finally {
    await f.cleanup()
  }
})

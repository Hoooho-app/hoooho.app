import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { HealthRecordOrganizationRepository } from '../ai/repositories/health-record-organization-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthInformationCandidateService } from './health-information-candidate-service.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthProfileFactRepository } from '../health-profile/repositories/health-profile-fact-repository.mjs'

const fact = (id, type, name, overrides = {}) => ({
  id, type, name, sourceText: name, originalText: name,
  subject: 'event_subject', polarity: 'affirmed', temporality: 'current', status: 'active',
  source: 'user_report', confidence: 0.9,
  time: { raw: null, resolvedStart: null, resolvedEnd: null, precision: 'unknown', source: 'selected_time' },
  ...(type === 'medication' ? { medicationAction: 'taken' } : {}),
  ...overrides
})

async function fixture() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-health-information-'))
  const events = new HealthEventRepository(dataDirectory)
  const records = new HealthEventRecordRepository(dataDirectory)
  const organizations = new HealthRecordOrganizationRepository(dataDirectory)
  const members = new FamilyMemberRepository(dataDirectory)
  const member = await members.create({ accountId: 'account-one', name: '小安', relationship: 'child', isSelf: false })
  const event = await events.create({
    accountId: 'account-one', memberId: member.id, title: '发热', category: 'fever', status: 'observing', startTime: '2026-08-01T00:00:00.000Z'
  }, new Date('2026-08-01T00:00:00.000Z'))
  return { dataDirectory, event, events, records, organizations }
}

async function addRecord(context, input, facts) {
  const record = await context.records.create({
    accountId: 'account-one', eventId: context.event.id, type: 'symptom', sourceType: 'voice_record', ...input
  }, new Date(input.occurredAt))
  await context.organizations.upsert({
    accountId: 'account-one', eventId: context.event.id, recordId: record.id,
    rawInput: record.sourceText || record.content,
    healthAIOutput: { facts, confidence: 0.9, timeConflict: { hasConflict: false, conflict: null } },
    status: 'completed', provider: 'test'
  }, new Date(input.occurredAt))
  return record
}

test('发现药物相关反应时保留来源、保持谨慎表述并支持幂等确认', async () => {
  const context = await fixture()
  try {
    const record = await addRecord(context, {
      content: '吃阿莫西林后出现皮疹', sourceText: '吃阿莫西林后出现皮疹', occurredAt: '2026-08-30T13:00:00.000Z'
    }, [fact('med-1', 'medication', '阿莫西林'), fact('sym-1', 'symptom', '皮疹')])
    const service = new HealthInformationCandidateService({ ...context, structuredMode: 'enabled' })
    const first = await service.discover('account-one', context.event.id)
    const second = await service.discover('account-one', context.event.id)
    assert.equal(first.length, 1)
    assert.equal(second.length, 1)
    assert.equal(first[0].title, '阿莫西林相关反应')
    assert.doesNotMatch(`${first[0].title}${first[0].description}`, /过敏|诊断/)
    assert.deepEqual(first[0].sourceRecordIds, [record.id])
    assert.equal(first[0].sourceRecords[0].content, '吃阿莫西林后出现皮疹')
    const confirmed = await service.update('account-one', first[0].id, {
      status: 'confirmed', destinationProfileSection: 'allergy_adverse_reaction', note: '由家长确认'
    }, new Date('2026-09-01T00:00:00.000Z'))
    assert.equal(confirmed.status, 'confirmed')
    assert.ok(confirmed.profileFactId)
    const profileFact = await new HealthProfileFactRepository(context.dataDirectory).findById(confirmed.profileFactId)
    assert.equal(profileFact.status, 'confirmed')
    assert.equal(profileFact.category, 'allergy')
    assert.equal(profileFact.sources[0].recordId, record.id)
    assert.equal((await context.records.findById(record.id)).content, '吃阿莫西林后出现皮疹')
    await assert.rejects(() => service.update('other-account', first[0].id, { status: 'dismissed' }), (error) => error.code === 'HEALTH_INFORMATION_CANDIDATE_NOT_FOUND')
  } finally { await rm(context.dataDirectory, { recursive: true, force: true }) }
})

test('重复症状、跨 14 天持续用药和明确医生记录按各自门槛产生候选', async () => {
  const context = await fixture()
  try {
    const dates = ['2026-08-01T01:00:00.000Z', '2026-08-10T01:00:00.000Z', '2026-08-20T01:00:00.000Z']
    for (let index = 0; index < dates.length; index += 1) {
      await addRecord(context, { content: `第${index + 1}次头痛并服用维生素D`, occurredAt: dates[index] }, [
        fact(`sym-${index}`, 'symptom', '头痛'), fact(`med-${index}`, 'medication', '维生素D')
      ])
    }
    await addRecord(context, { content: '医生明确记录哮喘', occurredAt: '2026-08-21T01:00:00.000Z' }, [
      fact('diagnosis-1', 'diagnosis', '哮喘', { diagnosisCertainty: 'confirmed', source: 'doctor_statement' })
    ])
    const candidates = await new HealthInformationCandidateService({ ...context, structuredMode: 'enabled' }).discover('account-one', context.event.id)
    assert.deepEqual(new Set(candidates.map((item) => item.category)), new Set(['chronic_condition', 'long_term_medication', 'important_health_fact']))
  } finally { await rm(context.dataDirectory, { recursive: true, force: true }) }
})

test('安全开关关闭时只列出现有候选，不从结构化结果创建新候选', async () => {
  const context = await fixture()
  try {
    await addRecord(context, { content: '吃阿莫西林后出现皮疹', occurredAt: '2026-08-30T13:00:00.000Z' }, [fact('med-1', 'medication', '阿莫西林'), fact('sym-1', 'symptom', '皮疹')])
    assert.deepEqual(await new HealthInformationCandidateService({ ...context, structuredMode: 'disabled' }).discover('account-one', context.event.id), [])
  } finally { await rm(context.dataDirectory, { recursive: true, force: true }) }
})

test('已有相关候选不会被自动合并或修改', async () => {
  const context = await fixture()
  try {
    for (let index = 1; index <= 3; index += 1) {
      await addRecord(context, { content: `第${index}次头痛`, occurredAt: `2026-08-0${index}T01:00:00.000Z` }, [fact(`sym-${index}`, 'symptom', '头痛')])
    }
    const service = new HealthInformationCandidateService({ ...context, structuredMode: 'enabled' })
    const original = (await service.discover('account-one', context.event.id))[0]
    await service.update('account-one', original.id, { status: 'confirmed', destinationProfileSection: 'chronic_condition' })
    await addRecord(context, { content: '第四次头痛', occurredAt: '2026-08-04T01:00:00.000Z' }, [fact('sym-4', 'symptom', '头痛')])
    const candidates = await service.discover('account-one', context.event.id)
    assert.equal(candidates.length, 2)
    assert.equal(candidates.find((item) => item.id === original.id).status, 'confirmed')
    assert.equal(candidates.find((item) => item.id !== original.id).relatedCandidateId, original.id)
  } finally { await rm(context.dataDirectory, { recursive: true, force: true }) }
})

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { FamilyMemberService } from '../../members/family-member-service.mjs'
import { HealthEventService } from '../../events/health-event-service.mjs'
import { HealthEventRecordService } from '../../events/health-event-record-service.mjs'
import { HealthRecordOrganizationService } from '../health-record-organization-service.mjs'
import { HealthOrganizationStateRepository } from '../repositories/health-organization-state-repository.mjs'
import { AIService } from '../ai-service.mjs'

async function fixture() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-ai-state-adversarial-'))
  const accountId = 'adversarial-account'
  const members = new FamilyMemberService({ dataDirectory })
  const events = new HealthEventService({ dataDirectory })
  const organizations = new HealthRecordOrganizationService({ dataDirectory })
  const records = new HealthEventRecordService({ dataDirectory, organizations })
  const member = await members.create(accountId, { name: '测试对象', relationship: 'other', gender: 'male', birthday: '1990-01-01' })
  const event = await events.create(accountId, {
    memberId: member.id, title: '', category: 'other', startTime: '2026-08-20T08:00:00+08:00'
  })
  return { dataDirectory, accountId, events, records, organizations, event }
}

test('SEQ-D: editing 36.5 to 38.5 recomputes facts, summary, and projection', async () => {
  const f = await fixture()
  try {
    const record = await f.records.create(f.accountId, f.event.id, {
      type: 'symptom', content: '体温36.5度。', occurredAt: '2026-08-20T09:00:00+08:00'
    })
    await f.organizations.organize(f.accountId, f.event.id, { recordId: record.id })
    await f.records.update(f.accountId, record.id, { content: '体温38.5度。' })

    const [organization] = await f.organizations.list(f.accountId, f.event.id)
    const event = await f.events.get(f.accountId, f.event.id)
    assert.equal(organization.rawInput, '体温38.5度。', 'organization must not retain edited raw input')
    assert.equal(organization.organizedHealthData.temperature?.max, 38.5, 'temperature projection must recompute')
    assert.match(event.eventSummary?.displayedResult.summary ?? '', /38\.5℃/, 'summary must recompute')
  } finally { await rm(f.dataDirectory, { recursive: true, force: true }) }
})

test('SEQ-C: deleting recovery record removes its organization and recomputes current state', async () => {
  const f = await fixture()
  try {
    const first = await f.records.create(f.accountId, f.event.id, {
      type: 'symptom', content: '咳嗽三天。', occurredAt: '2026-08-20T09:00:00+08:00'
    })
    const recovery = await f.records.create(f.accountId, f.event.id, {
      type: 'symptom', content: '现在已经不咳了。', occurredAt: '2026-08-20T10:00:00+08:00'
    })
    await f.organizations.organize(f.accountId, f.event.id, { recordId: first.id })
    await f.organizations.organize(f.accountId, f.event.id, { recordId: recovery.id })
    await f.records.delete(f.accountId, recovery.id)

    const organizations = await f.organizations.list(f.accountId, f.event.id)
    assert.equal(organizations.some((item) => item.recordId === recovery.id), false, 'deleted record organization must not remain')
  } finally { await rm(f.dataDirectory, { recursive: true, force: true }) }
})

test('SEQ-E: deleting the last record clears organizations and stale event summary', async () => {
  const f = await fixture()
  try {
    const record = await f.records.create(f.accountId, f.event.id, {
      type: 'symptom', content: '发烧38.5度。', occurredAt: '2026-08-20T09:00:00+08:00'
    })
    assert.ok((await f.events.get(f.accountId, f.event.id)).eventSummary)
    await f.records.delete(f.accountId, record.id)
    assert.deepEqual(await f.organizations.list(f.accountId, f.event.id), [])
    const event = await f.events.get(f.accountId, f.event.id)
    assert.equal(event.eventSummary, null)
    assert.equal(event.title, '')
  } finally { await rm(f.dataDirectory, { recursive: true, force: true }) }
})

test('SEQ-F: rapid edits expose only the organization for the latest record revision', async () => {
  const f = await fixture()
  try {
    const record = await f.records.create(f.accountId, f.event.id, {
      type: 'symptom', content: '体温37.1度。', occurredAt: '2026-08-20T09:00:00+08:00'
    })
    await f.records.update(f.accountId, record.id, { content: '体温38.1度。' }, new Date('2026-08-20T10:01:00Z'))
    await f.records.update(f.accountId, record.id, { content: '体温39.1度。' }, new Date('2026-08-20T10:02:00Z'))
    const [organization] = await f.organizations.list(f.accountId, f.event.id)
    assert.equal(organization.rawInput, '体温39.1度。')
    assert.equal(organization.organizedHealthData.temperature.max, 39.1)
    assert.ok(organization.healthAIOutput.facts.every((fact) => fact.sourceRecordId === record.id && fact.organizationRevision === organization.sourceRevision))
  } finally { await rm(f.dataDirectory, { recursive: true, force: true }) }
})

test('SEQ-G: a failed organization keeps the raw record and marks the event failed', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-ai-failed-'))
  const accountId = 'failed-account'
  try {
    const members = new FamilyMemberService({ dataDirectory })
    const events = new HealthEventService({ dataDirectory })
    const member = await members.create(accountId, { name: '测试对象', relationship: 'other', gender: 'male', birthday: '1990-01-01' })
    const event = await events.create(accountId, { memberId: member.id, title: '', category: 'other', startTime: '2026-08-20T08:00:00+08:00' })
    const organizations = new HealthRecordOrganizationService({ dataDirectory, ai: { organizeHealthRecord: async () => { throw Object.assign(new Error('failed'), { code: 'TEST_AI_FAILED' }) } } })
    const records = new HealthEventRecordService({ dataDirectory, organizations })
    const record = await records.create(accountId, event.id, { type: 'symptom', content: '咳嗽。', occurredAt: '2026-08-20T09:00:00+08:00' })
    assert.equal((await records.list(accountId, event.id))[0].id, record.id)
    const state = await new HealthOrganizationStateRepository(dataDirectory).get(event.id)
    assert.equal(state.status, 'failed')
    assert.equal(state.errorCode, 'TEST_AI_FAILED')
    const failedEvent = await events.get(accountId, event.id)
    assert.equal(failedEvent.eventSummary, null)
    assert.equal(failedEvent.title, '')
    assert.equal(failedEvent.organizationState.status, 'failed')
  } finally { await rm(dataDirectory, { recursive: true, force: true }) }
})

test('SEQ-H: an older asynchronous recompute cannot become the displayed revision', async () => {
  const f = await fixture()
  try {
    const record = await f.records.create(f.accountId, f.event.id, { type: 'symptom', content: '体温37度。', occurredAt: '2026-08-20T09:00:00+08:00' })
    let release
    let started
    const gate = new Promise((resolve) => { release = resolve })
    const seen = new Promise((resolve) => { started = resolve })
    let calls = 0
    const actualAI = new AIService({ primaryProvider: null })
    const delayed = new HealthRecordOrganizationService({ dataDirectory: f.dataDirectory, ai: {
      organizeHealthRecord: async (...args) => {
        calls += 1
        if (calls === 1) { started(); await gate }
        return actualAI.organizeHealthRecord(...args)
      }
    } })
    const oldRun = delayed.invalidateAndRecompute(f.accountId, f.event.id)
    await seen
    await delayed.records.update(record.id, { content: '体温39度。' }, new Date('2026-08-20T10:00:00Z'))
    const newRun = delayed.invalidateAndRecompute(f.accountId, f.event.id)
    await newRun
    release()
    assert.equal((await oldRun).stale, true)
    const [organization] = await delayed.list(f.accountId, f.event.id)
    assert.equal(organization.rawInput, '体温39度。')
    assert.equal(organization.organizedHealthData.temperature.max, 39)
  } finally { await rm(f.dataDirectory, { recursive: true, force: true }) }
})

test('SUMMARY-DYNAMIC: record create, diagnosis precedence, negation, edit and delete all recompute current summary', async () => {
  const f = await fixture()
  try {
    await f.records.create(f.accountId, f.event.id, { type: 'symptom', content: '我头疼。', occurredAt: '2026-08-20T09:00:00+08:00' })
    const foot = await f.records.create(f.accountId, f.event.id, { type: 'symptom', content: '我的脚也疼，而且脚上有点红，还有些痒。', occurredAt: '2026-08-20T10:00:00+08:00' })
    let summary = (await f.events.get(f.accountId, f.event.id)).eventSummary.displayedResult
    assert.deepEqual(summary.tags.map(({ label }) => label), ['头痛', '脚痛', '脚部发红', '瘙痒'])

    await f.records.create(f.accountId, f.event.id, { type: 'note', content: 'AI问诊认为大概率是皮炎。', occurredAt: '2026-08-20T11:00:00+08:00' })
    summary = (await f.events.get(f.accountId, f.event.id)).eventSummary.displayedResult
    assert.equal(summary.tags[0].label, '疑似皮炎')
    assert.match(summary.summary, /AI问诊.*可能为皮炎/)

    await f.records.create(f.accountId, f.event.id, { type: 'visit', content: '医生诊断为皮炎。', occurredAt: '2026-08-20T12:00:00+08:00' })
    summary = (await f.events.get(f.accountId, f.event.id)).eventSummary.displayedResult
    assert.equal(summary.tags[0].label, '皮炎')
    assert.equal(summary.tags[0].source, 'doctor_statement')

    await f.records.create(f.accountId, f.event.id, { type: 'visit', content: '医生说不是皮炎。', occurredAt: '2026-08-20T13:00:00+08:00' })
    summary = (await f.events.get(f.accountId, f.event.id)).eventSummary.displayedResult
    assert.equal(summary.tags.some(({ label }) => label.includes('皮炎')), false)

    await f.records.create(f.accountId, f.event.id, { type: 'symptom', content: '头已经不疼了，但脚还是疼。', occurredAt: '2026-08-20T14:00:00+08:00' })
    summary = (await f.events.get(f.accountId, f.event.id)).eventSummary.displayedResult
    assert.equal(summary.tags.some(({ label }) => label === '头痛'), false)
    assert.equal(summary.tags.some(({ label }) => label === '脚痛'), true)

    await f.records.update(f.accountId, foot.id, { content: '脚已经不疼了。' })
    summary = (await f.events.get(f.accountId, f.event.id)).eventSummary.displayedResult
    assert.equal(summary.tags.some(({ label }) => ['脚部发红', '瘙痒'].includes(label)), false)
    assert.equal(summary.tags.some(({ label }) => label === '脚痛'), true)

    await f.records.delete(f.accountId, foot.id)
    summary = (await f.events.get(f.accountId, f.event.id)).eventSummary.displayedResult
    assert.equal(summary.tags.some(({ label }) => ['脚部发红', '瘙痒'].includes(label)), false)
  } finally { await rm(f.dataDirectory, { recursive: true, force: true }) }
})

test('SUMMARY-CONFIRMED: quick record diagnosis propagates to the event summary and edit/delete revoke it', async () => {
  const f = await fixture()
  try {
    await f.records.create(f.accountId, f.event.id, {
      type: 'symptom', content: '现在挺痒的。', occurredAt: '2026-08-20T09:00:00+08:00'
    })
    const diagnosisRecord = await f.records.create(f.accountId, f.event.id, {
      type: 'note', content: '确诊了那个荨麻疹。', occurredAt: '2026-08-20T10:00:00+08:00'
    })
    let organization = (await f.organizations.list(f.accountId, f.event.id)).find(({ recordId }) => recordId === diagnosisRecord.id)
    let diagnosis = organization.healthAIOutput.facts.find((fact) => fact.type === 'diagnosis')
    let diagnosedEvent = await f.events.get(f.accountId, f.event.id)
    assert.equal(organization.rawInput, '确诊了那个荨麻疹。')
    assert.equal(diagnosis.name, '荨麻疹')
    assert.equal(diagnosis.diagnosisCertainty, 'confirmed')
    assert.equal(diagnosis.source, 'user_report')
    assert.equal(diagnosis.sourceRecordId, diagnosisRecord.id)
    assert.equal(diagnosedEvent.organizationState.status, 'completed')
    assert.equal(diagnosedEvent.eventSummary.displayedResult.title, '荨麻疹')
    assert.equal(diagnosedEvent.eventSummary.displayedResult.tags[0].sourceRecordId, diagnosisRecord.id)

    await f.records.update(f.accountId, diagnosisRecord.id, { content: '只是怀疑荨麻疹，还没确诊。' })
    diagnosedEvent = await f.events.get(f.accountId, f.event.id)
    assert.notEqual(diagnosedEvent.eventSummary.displayedResult.title, '荨麻疹')
    assert.equal(diagnosedEvent.eventSummary.displayedResult.tags.some((tag) => tag.kind === 'diagnosis'), false)

    await f.records.update(f.accountId, diagnosisRecord.id, { content: '医生确诊是荨麻疹。' })
    organization = (await f.organizations.list(f.accountId, f.event.id)).find(({ recordId }) => recordId === diagnosisRecord.id)
    diagnosis = organization.healthAIOutput.facts.find((fact) => fact.type === 'diagnosis')
    diagnosedEvent = await f.events.get(f.accountId, f.event.id)
    assert.equal(diagnosis.source, 'doctor_statement')
    assert.equal(diagnosedEvent.eventSummary.displayedResult.title, '荨麻疹')

    await f.records.delete(f.accountId, diagnosisRecord.id)
    diagnosedEvent = await f.events.get(f.accountId, f.event.id)
    assert.notEqual(diagnosedEvent.eventSummary.displayedResult.title, '荨麻疹')
  } finally { await rm(f.dataDirectory, { recursive: true, force: true }) }
})

test('SUMMARY-VERSION: listing events refreshes a stale persisted summary without reparsing facts', async () => {
  const f = await fixture()
  try {
    await f.records.create(f.accountId, f.event.id, {
      type: 'note', content: '确诊了那个荨麻疹。', occurredAt: '2026-08-20T10:00:00+08:00'
    })
    const current = await f.events.get(f.accountId, f.event.id)
    const { aggregationVersion: _discarded, ...legacySummary } = current.eventSummary
    await f.events.repository.update(f.event.id, {
      title: '瘙痒', eventSummary: { ...legacySummary, displayedResult: { ...legacySummary.displayedResult, title: '瘙痒' } }
    })
    const eventsWithRefresh = new HealthEventService({ dataDirectory: f.dataDirectory, summaryRefresher: f.organizations })
    const [listed] = await eventsWithRefresh.list(f.accountId)
    assert.equal(listed.eventSummary.aggregationVersion, 3)
    assert.equal(listed.eventSummary.displayedResult.title, '荨麻疹')
  } finally { await rm(f.dataDirectory, { recursive: true, force: true }) }
})

test('SUMMARY-FAILURE: a failed recompute preserves the last completed summary and raw record', async () => {
  const f = await fixture()
  try {
    await f.records.create(f.accountId, f.event.id, { type: 'symptom', content: '头疼。', occurredAt: '2026-08-20T09:00:00+08:00' })
    const completedSummary = (await f.events.get(f.accountId, f.event.id)).eventSummary
    const failingOrganizations = new HealthRecordOrganizationService({
      dataDirectory: f.dataDirectory,
      ai: { organizeHealthRecord: async () => { throw Object.assign(new Error('failed'), { code: 'TEST_AI_FAILED' }) } }
    })
    const failingRecords = new HealthEventRecordService({ dataDirectory: f.dataDirectory, organizations: failingOrganizations })
    const saved = await failingRecords.create(f.accountId, f.event.id, { type: 'symptom', content: '脚疼。', occurredAt: '2026-08-20T10:00:00+08:00' })
    assert.ok((await failingRecords.list(f.accountId, f.event.id)).some(({ id }) => id === saved.id))
    const failedEvent = await f.events.get(f.accountId, f.event.id)
    assert.deepEqual(failedEvent.eventSummary, completedSummary)
    assert.equal(failedEvent.organizationState.status, 'failed')
  } finally { await rm(f.dataDirectory, { recursive: true, force: true }) }
})

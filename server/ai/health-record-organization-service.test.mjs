import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { FamilyMemberService } from '../members/family-member-service.mjs'
import { HealthEventService } from '../events/health-event-service.mjs'
import { HealthEventRecordService } from '../events/health-event-record-service.mjs'
import { HealthRecordOrganizationService } from './health-record-organization-service.mjs'

test('结构化健康事实保留原文、识别否定表达并隔离账号', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-ai-organization-'))
  const accountId = 'account-one'
  try {
    const members = new FamilyMemberService({ dataDirectory })
    const events = new HealthEventService({ dataDirectory })
    const records = new HealthEventRecordService({ dataDirectory })
    const organizations = new HealthRecordOrganizationService({ dataDirectory })
    const member = await members.create(accountId, { name: '小明', relationship: 'child', gender: 'male', birthday: '2018-08-09' })
    const event = await events.create(accountId, { memberId: member.id, title: '', category: 'other', startTime: '2026-08-09T09:00:00+08:00' })

    const organize = async (content) => {
      const record = await records.create(accountId, event.id, { type: 'symptom', content, occurredAt: '2026-08-09T10:00:00+08:00' })
      return organizations.organize(accountId, event.id, { recordId: record.id })
    }

    const cough = await organize('咳嗽三天，没有发烧')
    assert.equal(cough.rawInput, '咳嗽三天，没有发烧')
    assert.equal(cough.confirmedData, null)
    assert.equal(cough.organizedHealthData.temperature, null)
    assert.match(cough.organizedHealthData.symptoms[0].content, /咳嗽/)
    assert.doesNotMatch(cough.organizedHealthData.symptoms[0].content, /发热/)

    const fever = await organize('38.5度，吃了一次退烧药')
    assert.match(fever.organizedHealthData.symptoms[0].content, /发热/)
    assert.deepEqual(fever.organizedHealthData.temperature, { min: 38.5, max: 38.5, unit: '℃' })
    assert.equal(fever.organizedHealthData.medications[0].content, '退烧药一次')

    const progression = await organize('今天早上7点感冒，晚上好一点，体温37到38度。')
    assert.deepEqual(progression.organizedHealthData.temperature, { min: 37, max: 38, unit: '℃' })
    assert.equal(progression.organizedHealthData.timeline.length, 2)
    assert.equal(progression.organizedHealthData.timeline[0].time, '07:00')
    assert.match(progression.organizedHealthData.timeline[0].content, /感冒/)
    assert.equal(progression.organizedHealthData.timeline[1].time, '晚上')
    assert.match(progression.organizedHealthData.timeline[1].content, /好一点/)

    const detailedProgression = await organize('今天早上7点的时候，有一点感冒的前兆，然后脚有点凉，到了今天晚上就好一点了，但是手脚还是有点冷，目前感觉身体稍微有点发虚，体温一直在37度到38度之间，没有高烧')
    assert.deepEqual(detailedProgression.organizedHealthData.temperature, { min: 37, max: 38, unit: '℃' })
    assert.equal(detailedProgression.organizedHealthData.timeline.length, 2)
    assert.deepEqual(detailedProgression.organizedHealthData.timeline.map((item) => item.time), ['07:00', '今天晚上'])
    assert.match(detailedProgression.organizedHealthData.symptoms[0].content, /感冒表现/)
    assert.match(detailedProgression.organizedHealthData.symptoms[0].content, /手脚发凉/)
    assert.match(detailedProgression.organizedHealthData.symptoms[0].content, /乏力/)
    assert.doesNotMatch(detailedProgression.organizedHealthData.symptoms[0].content, /发热/)

    const spokenPeriods = await organize('今早开始咳嗽，夜里感觉好一些，半夜又有点冷')
    assert.equal(spokenPeriods.organizedHealthData.timeline.length, 3)
    assert.deepEqual(spokenPeriods.organizedHealthData.timeline.map((item) => item.time), ['今早', '夜里', '半夜'])

    const concern = await organize('担心是不是严重疾病')
    assert.deepEqual(concern.organizedHealthData.symptoms, [])
    assert.equal(concern.organizedHealthData.concerns[0].content, '担心是不是严重疾病')
    assert.deepEqual(concern.organizedHealthData.attachments, [])

    const list = await organizations.list(accountId, event.id)
    assert.equal(list.length, 6)
    assert.ok(list.every((organization) => organization.schemaVersion === 2))
    await assert.rejects(() => organizations.list('other-account', event.id), (error) => error.code === 'HEALTH_EVENT_NOT_FOUND')
  } finally {
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

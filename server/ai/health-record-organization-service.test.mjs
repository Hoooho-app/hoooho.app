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
    assert.equal(cough.schemaVersion, 5)
    assert.equal(cough.healthAIOutput.parserVersion, '1.1.0')
    assert.equal(cough.healthAIOutput.promptVersion, 'health-facts-v2-status-change')
    assert.ok(cough.healthAIOutput.facts.every((fact) => fact.id && fact.sourceText && typeof fact.confidence === 'number'))
    assert.ok(cough.healthAIOutput.facts.every((fact) => fact.time.source === 'selected_time'))
    assert.ok(cough.healthAIOutput.facts.every((fact) => fact.time.resolvedStart === '2026-08-09T10:00:00+08:00'))
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

    const invalidPreview = await organizations.preview(accountId, event.id, { rawInput: '北京' })
    assert.equal(invalidPreview.hasHealthFacts, false)
    assert.deepEqual(invalidPreview.organizedHealthData.symptoms, [])

    const structuredBodyPartPreview = await organizations.preview(accountId, event.id, {
      rawInput: '颈部不舒服',
      bodyLocations: ['颈'],
      selectedOccurredAt: '2026-08-09T10:00:00+08:00'
    })
    assert.equal(structuredBodyPartPreview.hasHealthFacts, true)
    assert.ok(structuredBodyPartPreview.healthAIOutput.facts.some((fact) => (
      fact.type === 'symptom'
      && fact.name === '颈部不舒服'
      && fact.bodyPart === '颈'
      && fact.time.resolvedStart === '2026-08-09T10:00:00+08:00'
    )))

    await assert.rejects(
      () => organizations.preview(accountId, event.id, { rawInput: '   ', bodyLocations: [] }),
      (error) => error.code === 'EMPTY_RAW_INPUT'
    )

    const structuredRecord = await records.create(accountId, event.id, {
      type: 'symptom',
      content: '颈部不舒服',
      occurredAt: '2026-08-09T11:00:00+08:00'
    })
    const structuredOrganization = await organizations.organize(accountId, event.id, {
      recordId: structuredRecord.id,
      context: '身体部位：颈'
    })
    assert.ok(structuredOrganization.healthAIOutput.facts.some((fact) => (
      fact.type === 'symptom' && fact.name === '颈部不舒服' && fact.bodyPart === '颈'
    )))

    const summarizedEvent = await events.get(accountId, event.id)
    assert.ok(summarizedEvent.eventSummary?.systemGenerated)
    assert.ok(summarizedEvent.eventSummary.displayedResult.title)
    assert.ok(summarizedEvent.eventSummary.displayedResult.summary)
    assert.ok(summarizedEvent.eventSummary.displayedResult.evidence.length > 0)

    const factSnapshot = JSON.stringify((await organizations.list(accountId, event.id)).flatMap((item) => item.healthAIOutput.facts))
    const correctedEvent = await events.correctSummary(accountId, event.id, {
      title: '8月健康情况',
      summary: '这是用户校对后的事件摘要。'
    }, new Date('2026-08-12T06:00:00.000Z'))
    assert.equal(correctedEvent.eventSummary.displayedResult.title, '8月健康情况')
    assert.equal(correctedEvent.eventSummary.displayedResult.source, 'user_corrected')
    assert.equal(JSON.stringify((await organizations.list(accountId, event.id)).flatMap((item) => item.healthAIOutput.facts)), factSnapshot)

    const coughPreview = await organizations.preview(accountId, event.id, { rawInput: '孩子咳嗽两天' })
    assert.equal(coughPreview.hasHealthFacts, true)

    const temperaturePreview = await organizations.preview(accountId, event.id, { rawInput: '38.5度' })
    assert.equal(temperaturePreview.hasHealthFacts, true)

    const mixedPreview = await organizations.preview(accountId, event.id, { rawInput: '今天早上喉咙痛，晚上38.5度，吃一次退烧药' })
    assert.ok(mixedPreview.healthAIOutput.facts.length >= 3)
    assert.ok(mixedPreview.healthAIOutput.facts.some((fact) => fact.type === 'symptom' && fact.name === '喉咙痛'))
    assert.ok(mixedPreview.healthAIOutput.facts.some((fact) => fact.type === 'temperature' && fact.temperature?.min === 38.5))
    assert.ok(mixedPreview.healthAIOutput.facts.some((fact) => fact.type === 'medication' && fact.name === '退烧药一次'))

    const timePreview = await organizations.preview(accountId, event.id, { rawInput: '昨天头痛，今天发烧' })
    const timedSymptoms = timePreview.healthAIOutput.facts.filter((fact) => fact.type === 'symptom')
    assert.ok(timedSymptoms.some((fact) => fact.name === '头痛' && fact.time.raw === '昨天'))
    assert.ok(timedSymptoms.some((fact) => fact.name === '发热' && fact.time.raw === '今天'))

    const bodyPartPreview = await organizations.preview(accountId, event.id, { rawInput: '左腿皮肤红肿' })
    assert.ok(bodyPartPreview.healthAIOutput.facts.some((fact) => fact.type === 'symptom' && fact.bodyPart === '左腿'))

    const negatedTemperaturePreview = await organizations.preview(accountId, event.id, { rawInput: '没有发烧' })
    assert.equal(negatedTemperaturePreview.healthAIOutput.facts.some((fact) => fact.type === 'temperature'), false)
    assert.equal(negatedTemperaturePreview.healthAIOutput.facts.some((fact) => fact.type === 'status_change'), false)
    assert.equal(negatedTemperaturePreview.hasHealthFacts, false)

    const improvedPreview = await organizations.preview(accountId, event.id, { rawInput: '昨晚发烧，今天好多了' })
    const improvement = improvedPreview.healthAIOutput.facts.find((fact) => fact.type === 'status_change')
    assert.equal(improvement.target, '发热')
    assert.equal(improvement.change, 'improved')
    assert.equal(improvement.time.raw, '今天')

    const worsenedPreview = await organizations.preview(accountId, event.id, { rawInput: '咳嗽三天越来越严重' })
    const worsening = worsenedPreview.healthAIOutput.facts.find((fact) => fact.type === 'status_change')
    assert.equal(worsening.target, '咳嗽')
    assert.equal(worsening.change, 'worsened')

    const persistentPreview = await organizations.preview(accountId, event.id, { rawInput: '一直腹痛' })
    const persistence = persistentPreview.healthAIOutput.facts.find((fact) => fact.type === 'status_change')
    assert.equal(persistence.target, '腹痛')
    assert.equal(persistence.change, 'persistent')

    const list = await organizations.list(accountId, event.id)
    assert.equal(list.length, 7)
    assert.ok(list.every((organization) => organization.schemaVersion === 5))
    await assert.rejects(() => organizations.list('other-account', event.id), (error) => error.code === 'HEALTH_EVENT_NOT_FOUND')
  } finally {
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

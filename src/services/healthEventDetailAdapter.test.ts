import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  EventAttachmentApiDto,
  HealthEventApiDto,
  HealthEventRecordApiDto,
  HealthFact,
  HealthRecordOrganizationApiDto,
  OrganizedHealthData
} from '../types'
import { adaptHealthEventDetail } from './healthEventDetailAdapter'
import { groupTimelineByYearAndDate } from './healthTimelineGrouping'

const emptyOrganizedData: OrganizedHealthData = {
  symptoms: [], temperature: null, medications: [], visits: [], examinations: [], concerns: [], attachments: [], timeline: []
}

const eventDto: HealthEventApiDto = {
  id: 'event-1', accountId: 'account-1', memberId: 'member-1', title: '', category: 'other', status: 'observing',
  startTime: '2026-08-10T00:00:00.000Z', createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z'
}

function record(id: string, content: string, occurredAt = '2026-08-10T12:00:00.000Z', createdAt = occurredAt): HealthEventRecordApiDto {
  return { id, accountId: 'account-1', eventId: 'event-1', type: 'note', content, occurredAt, createdAt, updatedAt: createdAt }
}

function fact(id: string, type: HealthFact['type'], name: string, raw: string | null, resolvedStart: string | null, bodyPart: string | null = null): HealthFact {
  return {
    id, type, name, bodyPart, sourceText: name,
    time: { raw, resolvedStart, resolvedEnd: null, precision: raw ? 'period' : 'unknown', source: 'user_text' },
    confidence: 0.95,
    ...(type === 'temperature' ? { temperature: { min: 38.5, max: 38.5, unit: '℃' as const } } : {})
  }
}

function organization(recordId: string, facts: HealthFact[], organizedHealthData = emptyOrganizedData): HealthRecordOrganizationApiDto {
  return {
    id: `organization-${recordId}`,
    accountId: 'account-1', eventId: 'event-1', recordId, rawInput: '原始输入',
    healthAIOutput: {
      facts, confidence: facts.length ? 0.95 : 0, parserVersion: '1.1.0', promptVersion: 'health-facts-v2-status-change',
      timeConflict: { hasConflict: false, conflict: null }
    },
    organizedHealthData,
    confirmedData: null,
    status: 'completed', provider: 'test',
    createdAt: '2026-08-10T12:01:00.000Z', updatedAt: '2026-08-10T12:01:00.000Z'
  }
}

test('详情页完全由 HealthFact 生成时间线、标签和体温记录', () => {
  const sourceRecord = record('record-1', '今天早上头痛，晚上38.5度，吃退烧药')
  const facts = [
    fact('fact-1', 'symptom', '头痛', '今天早上', '2026-08-10T06:00:00+08:00', '头'),
    fact('fact-2', 'temperature', '38.5℃', '晚上', '2026-08-10T18:00:00+08:00'),
    fact('fact-3', 'medication', '退烧药', '晚上', '2026-08-10T18:00:00+08:00')
  ]
  const view = adaptHealthEventDetail(eventDto, [sourceRecord], [organization(sourceRecord.id, facts)])

  assert.equal(view.event.timeline.length, 3)
  assert.deepEqual(view.event.timeline.map((entry) => entry.content), ['退烧药', '38.5℃', '头痛'])
  assert.equal(view.event.timeline[2].segments?.[0].label, '部位')
  assert.equal(view.event.timeline[2].segments?.[0].content, '头')
  assert.equal(view.event.temperatureRecords.length, 1)
  assert.equal(view.event.temperatureRecords[0].value, 38.5)
  assert.deepEqual(view.event.symptoms, ['头痛'])
  assert.deepEqual(view.event.medications, ['退烧药'])
})

test('无对应 Fact 时隐藏健康模块，并忽略旧 organizedHealthData 假数据', () => {
  const sourceRecord = record('record-2', '北京')
  const legacyData: OrganizedHealthData = {
    ...emptyOrganizedData,
    symptoms: [{ content: '错误症状', keywords: ['错误症状'] }],
    temperature: { min: 39, max: 39, unit: '℃' }
  }
  const invalid = adaptHealthEventDetail(eventDto, [sourceRecord], [organization(sourceRecord.id, [], legacyData)])
  assert.equal(invalid.event.timeline.length, 0)
  assert.equal(invalid.event.temperatureRecords.length, 0)
  assert.deepEqual(invalid.event.symptoms, [])

  const cough = adaptHealthEventDetail(eventDto, [sourceRecord], [organization(sourceRecord.id, [fact('fact-cough', 'symptom', '咳嗽', null, null)])])
  assert.equal(cough.event.timeline.length, 1)
  assert.equal(cough.event.timeline[0].time, sourceRecord.createdAt)
  assert.equal(cough.event.temperatureRecords.length, 0)
  assert.deepEqual(cough.event.medications, [])
  assert.deepEqual(cough.event.attachments, [])

  const noFever = adaptHealthEventDetail(eventDto, [sourceRecord], [organization(sourceRecord.id, [])])
  assert.equal(noFever.event.temperatureRecords.length, 0)
})

test('真实附件只跟随所属记录，没有图片时不生成附件时间线', () => {
  const sourceRecord = record('record-3', '上传图片')
  const withoutAttachment = adaptHealthEventDetail(eventDto, [sourceRecord], [], [])
  assert.equal(withoutAttachment.event.timeline.length, 0)

  const attachment: EventAttachmentApiDto = {
    id: 'attachment-1', accountId: 'account-1', eventId: 'event-1', recordId: sourceRecord.id,
    name: '检查单.jpg', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AA==', createdAt: sourceRecord.createdAt
  }
  const withAttachment = adaptHealthEventDetail(eventDto, [sourceRecord], [], [attachment])
  assert.equal(withAttachment.event.timeline.length, 1)
  assert.equal(withAttachment.event.timeline[0].segments?.[0].label, '记录')
  assert.equal(withAttachment.event.timeline[0].attachments?.length, 1)
})

test('图片分析结果驱动时间线与体温记录，附件缩略图仍保留', () => {
  const sourceRecord = record('record-image-temperature', '图片记录', '2026-08-12T07:25:00.000Z')
  const imageFact = fact('fact-image-temperature', 'temperature', '38.5℃', null, sourceRecord.occurredAt)
  imageFact.time.source = 'document'
  const attachment: EventAttachmentApiDto = {
    id: 'attachment-temperature', accountId: 'account-1', eventId: 'event-1', recordId: sourceRecord.id,
    name: '体温计.jpg', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AA==', createdAt: sourceRecord.createdAt,
    analysis: {
      status: 'completed', category: 'temperature', summary: '体温计显示 38.5℃',
      temperatureValue: 38.5, extractedFacts: [imageFact], confidence: 0.98,
      provider: 'fixture-vision', analyzedAt: sourceRecord.createdAt
    }
  }
  const view = adaptHealthEventDetail(eventDto, [sourceRecord], [], [attachment])

  assert.equal(view.event.timeline.length, 1)
  assert.equal(view.event.timeline[0].segments?.[0].label, '体温')
  assert.equal(view.event.timeline[0].attachments?.length, 1)
  assert.equal(view.event.temperatureRecords[0].value, 38.5)
})

test('无法分析图片时降级为图片记录，不泄露文件名', () => {
  const sourceRecord = record('record-image-fallback', '图片记录')
  const attachment: EventAttachmentApiDto = {
    id: 'attachment-fallback', accountId: 'account-1', eventId: 'event-1', recordId: sourceRecord.id,
    name: 'private-file-name.jpg', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AA==', createdAt: sourceRecord.createdAt,
    analysis: {
      status: 'unavailable', category: 'other', summary: '图片记录', extractedFacts: [],
      provider: null, analyzedAt: sourceRecord.createdAt, errorCode: 'VISION_NOT_CONFIGURED'
    }
  }
  const view = adaptHealthEventDetail(eventDto, [sourceRecord], [], [attachment])

  assert.equal(view.event.timeline[0].content, '图片记录')
  assert.equal(view.event.timeline[0].content.includes(attachment.name), false)
})

test('状态变化事实使用自然中文接入现有时间线', () => {
  const sourceRecord = record('record-4', '今天早上退了一点')
  const changes: HealthFact[] = [
    {
      ...fact('fact-improved', 'status_change', '发热好转', '今天早上', '2026-08-10T06:00:00+08:00'),
      target: '发热', change: 'improved'
    },
    {
      ...fact('fact-worsened', 'status_change', '咳嗽加重', '今天上午', '2026-08-10T09:00:00+08:00'),
      target: '咳嗽', change: 'worsened'
    },
    {
      ...fact('fact-persistent', 'status_change', '腹痛持续', '今天下午', '2026-08-10T14:00:00+08:00'),
      target: '腹痛', change: 'persistent'
    }
  ]
  const view = adaptHealthEventDetail(eventDto, [sourceRecord], [organization(sourceRecord.id, changes)])

  assert.equal(view.event.timeline.length, 3)
  assert.deepEqual(view.event.timeline.map((entry) => entry.content), ['腹痛持续', '咳嗽加重', '发热有所好转'])
  assert.ok(view.event.timeline.every((entry) => entry.segments?.[0].label === '状态'))
  assert.equal(view.event.timeline.some((entry) => /improved|worsened|persistent/.test(entry.content)), false)
  assert.equal(view.event.temperatureRecords.length, 0)
})

test('症状与后续状态变化按解析时间共同进入时间线', () => {
  const sourceRecord = record('record-5', '昨晚发烧，今天好多了')
  const improvement: HealthFact = {
    ...fact('fact-improved-later', 'status_change', '发热好转', '今天早上', '2026-08-10T06:00:00+08:00'),
    target: '发热', change: 'improved'
  }
  const facts = [
    fact('fact-fever', 'symptom', '发热', '昨晚', '2026-08-09T18:00:00+08:00'),
    improvement
  ]
  const view = adaptHealthEventDetail(eventDto, [sourceRecord], [organization(sourceRecord.id, facts)])

  assert.deepEqual(view.event.timeline.map((entry) => entry.content), ['发热有所好转', '发热'])
  assert.deepEqual(view.event.timeline.map((entry) => entry.segments?.[0].label), ['状态', '症状'])
})

test('时间线按有记录的年份分组，年份不会重复进入 Fact 节点', () => {
  const sourceRecord = record('record-years', '跨年份健康经历')
  const facts = [
    {
      ...fact('fact-2026', 'symptom', '发热', '2026年', '2026-08-10T00:00:00+08:00'),
      time: {
        raw: '2026年', resolvedStart: '2026-08-10T00:00:00+08:00', resolvedEnd: null,
        precision: 'year' as const, source: 'user_text' as const
      }
    },
    {
      ...fact('fact-2025', 'symptom', '手脚发凉', '2025年', '2025-01-01T00:00:00+08:00'),
      time: {
        raw: '2025年', resolvedStart: '2025-01-01T00:00:00+08:00', resolvedEnd: null,
        precision: 'year' as const, source: 'user_text' as const
      }
    },
    {
      ...fact('fact-1998', 'examination', '一次检查', '1998年', '1998-01-01T00:00:00+08:00'),
      time: {
        raw: '1998年', resolvedStart: '1998-01-01T00:00:00+08:00', resolvedEnd: null,
        precision: 'year' as const, source: 'user_text' as const
      }
    }
  ]
  const view = adaptHealthEventDetail(eventDto, [sourceRecord], [organization(sourceRecord.id, facts)])
  const groups = groupTimelineByYearAndDate(view.event.timeline)

  assert.deepEqual(groups.map((group) => group.year), [2026, 2025, 1998])
  assert.deepEqual(groups.map((group) => group.dates[0].date), ['8月10日', '1月1日', '1月1日'])
  assert.ok(view.event.timeline.every((entry) => entry.periodLabel === undefined))
  assert.equal(groups.some((group) => [2024, 2023, 2022].includes(group.year)), false)
})

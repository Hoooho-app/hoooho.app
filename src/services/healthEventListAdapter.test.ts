import assert from 'node:assert/strict'
import test from 'node:test'
import type { EventAttachmentApiDto, FamilyMemberApiDto, HealthEventApiDto, HealthEventRecordApiDto } from '../types/index.ts'
import { normalizeHealthEventTitle } from './healthEventFacts.ts'
import { getEventOccurredAt } from './healthEventListPresentation.ts'
import { adaptHealthEventList } from './healthEventListAdapter.ts'

const member: FamilyMemberApiDto = {
  id: 'member-1', accountId: 'account-1', name: '朱琳', relationship: 'self', gender: 'female',
  birthday: '1991-01-01', avatar: null, isSelf: true,
  createdAt: '2026-08-11T01:00:00.000Z', updatedAt: '2026-08-11T01:00:00.000Z'
}

const event: HealthEventApiDto = {
  id: 'event-1', accountId: 'account-1', memberId: member.id, title: '疼痛', category: 'pain', status: 'observing',
  startTime: '2026-08-11T01:00:00.000Z', createdAt: '2026-08-11T01:00:00.000Z', updatedAt: '2026-08-11T01:01:00.000Z'
}

const record: HealthEventRecordApiDto = {
  id: 'record-1', accountId: 'account-1', eventId: event.id, type: 'symptom', content: '疼',
  occurredAt: '2025-01-12T05:00:00.000Z', createdAt: '2026-08-11T01:01:00.000Z', updatedAt: '2026-08-11T01:01:00.000Z'
}
const now = new Date('2026-08-11T12:00:00.000Z')

test('列表使用 Record occurredAt 归属年份，而不是事件创建时间', () => {
  const occurredAt = getEventOccurredAt(event, [record])

  assert.equal(occurredAt, record.occurredAt)
  assert.equal(new Date(occurredAt).getUTCFullYear(), 2025)
  assert.equal(new Date(event.createdAt).getUTCFullYear(), 2026)
})

test('没有 Record 时回退到事件 startTime', () => {
  assert.equal(getEventOccurredAt(event, []), event.startTime)
})

test('旧事件标题仍可作为未结构化数据的速览特征，但不会成为定性标题', () => {
  const feverEvent = { ...event, title: '发热' }
  const feverRecord = { ...record, content: '发热' }
  const [adapted] = adaptHealthEventList([feverEvent], [member], new Map([[event.id, [feverRecord]]]), new Map(), now)

  assert.equal(adapted.definitionTitle, '未定性')
  assert.deepEqual(adapted.quickFacts, ['第1天', '发热'])
})

test('旧长描述只提炼一个真实特征，不再拼接自然语言伪摘要', () => {
  const longEvent = { ...event, title: '当时头上有点胀痛，而且有点冒汗' }
  const longRecord = { ...record, content: '当时头上有点胀痛，而且有点冒汗' }
  const [adapted] = adaptHealthEventList([longEvent], [member], new Map([[event.id, [longRecord]]]), new Map(), now)

  assert.equal(adapted.title, '头痛')
  assert.deepEqual(adapted.quickFacts, ['第1天', '头痛'])
})

test('事件标题保持简短并作为未结构化速览特征', () => {
  const coldEvent = { ...event, title: '手脚发凉' }
  const coldRecord = { ...record, content: '手脚发凉' }
  const title = normalizeHealthEventTitle(coldEvent.title, coldRecord.content)

  assert.equal(title, '手脚发凉')
})

test('一级列表只从可追溯的确认诊断标签读取定性标题', () => {
  const summarizedEvent: HealthEventApiDto = {
    ...event,
    eventSummary: {
      systemGenerated: { title: '甲型流感', summary: '系统摘要', tags: [], evidence: ['检查结果'], updatedAt: event.updatedAt },
      userCorrection: null,
      displayedResult: {
        title: '甲型流感', summary: '发热、头痛，最高体温39℃，检查提示甲型流感。',
        tags: [
          { label: '甲型流感', kind: 'diagnosis', source: 'doctor_statement', certainty: 'confirmed', priority: 100 },
          { label: '发热', kind: 'symptom', source: 'user_report', certainty: null, priority: 70 },
          { label: '头痛', kind: 'symptom', source: 'user_report', certainty: null, priority: 60 },
          { label: '最高39℃', kind: 'measurement', source: 'measurement', certainty: null, priority: 50 }
        ],
        evidence: ['检查结果'], updatedAt: event.updatedAt, source: 'system'
      },
      hasNewEvidenceAfterCorrection: false
    }
  }
  const [adapted] = adaptHealthEventList([summarizedEvent], [member], new Map([[event.id, [record]]]), new Map(), now)
  assert.equal(adapted.definitionTitle, '甲型流感')
  assert.deepEqual(adapted.quickFacts, ['第1天', '发热', '头痛'])
})

test('一级列表显示用户明确记录的 confirmed 诊断名称', () => {
  const diagnosedEvent: HealthEventApiDto = {
    ...event,
    eventSummary: {
      aggregationVersion: 2,
      systemGenerated: { title: '荨麻疹', summary: '系统摘要', tags: [], evidence: ['诊断记录'], updatedAt: event.updatedAt },
      userCorrection: null,
      displayedResult: {
        title: '荨麻疹', summary: '已记录明确诊断为荨麻疹。',
        tags: [{
          label: '荨麻疹', kind: 'diagnosis', source: 'user_report', certainty: 'confirmed', priority: 220,
          sourceRecordId: record.id, factUpdatedAt: record.updatedAt
        }],
        evidence: ['诊断记录'], updatedAt: event.updatedAt, source: 'system'
      },
      hasNewEvidenceAfterCorrection: false
    }
  }
  const [adapted] = adaptHealthEventList([diagnosedEvent], [member], new Map([[event.id, [record]]]), new Map(), now)
  assert.equal(adapted.definitionTitle, '荨麻疹')
})

test('图片-only 事件用分析结果生成标题摘要，不展示健康附件或文件名', () => {
  const imageEvent = { ...event, title: '健康附件' }
  const imageRecord = { ...record, type: 'note' as const, content: '图片记录' }
  const attachment: EventAttachmentApiDto = {
    id: 'attachment-1', accountId: 'account-1', eventId: event.id, recordId: record.id,
    name: 'image.jpg', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AA==', createdAt: record.createdAt,
    analysis: {
      status: 'completed', category: 'report', summary: '血常规报告', examinationName: '血常规',
      extractedFacts: [], confidence: 0.95, provider: 'fixture-vision', analyzedAt: record.createdAt
    }
  }
  const [adapted] = adaptHealthEventList(
    [imageEvent],
    [member],
    new Map([[event.id, [imageRecord]]]),
    new Map([[event.id, [attachment]]]),
    now
  )

  assert.equal(adapted.title, '检查结果')
  assert.deepEqual(adapted.quickFacts, ['第1天', '血常规报告'])
  assert.equal(`${adapted.title}${adapted.quickFacts.join('')}`.includes('image.jpg'), false)
})

test('Vision 不可用时图片-only 事件稳定降级为图片记录', () => {
  const imageEvent = { ...event, title: '健康附件' }
  const imageRecord = { ...record, type: 'note' as const, content: '图片记录' }
  const attachment: EventAttachmentApiDto = {
    id: 'attachment-fallback', accountId: 'account-1', eventId: event.id, recordId: record.id,
    name: 'image.jpg', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AA==', createdAt: record.createdAt,
    analysis: {
      status: 'unavailable', category: 'other', summary: '图片记录', extractedFacts: [],
      provider: null, analyzedAt: record.createdAt, errorCode: 'VISION_NOT_CONFIGURED'
    }
  }
  const [adapted] = adaptHealthEventList(
    [imageEvent], [member], new Map([[event.id, [imageRecord]]]), new Map([[event.id, [attachment]]]), now
  )
  assert.equal(adapted.title, '图片记录')
  assert.deepEqual(adapted.quickFacts, ['第1天', '图片记录'])
})

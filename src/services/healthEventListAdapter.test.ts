import assert from 'node:assert/strict'
import test from 'node:test'
import type { EventAttachmentApiDto, FamilyMemberApiDto, HealthEventApiDto, HealthEventRecordApiDto } from '../types/index.ts'
import { deriveHealthEventListSummary, normalizeHealthEventTitle } from './healthEventFacts.ts'
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

test('列表使用 Record occurredAt 归属年份，而不是事件创建时间', () => {
  const occurredAt = getEventOccurredAt(event, [record])

  assert.equal(occurredAt, record.occurredAt)
  assert.equal(new Date(occurredAt).getUTCFullYear(), 2025)
  assert.equal(new Date(event.createdAt).getUTCFullYear(), 2026)
})

test('没有 Record 时回退到事件 startTime', () => {
  assert.equal(getEventOccurredAt(event, []), event.startTime)
})

test('标题与主要症状相同，列表不生成重复摘要', () => {
  const feverEvent = { ...event, title: '发热' }
  const feverRecord = { ...record, content: '发热' }
  const title = normalizeHealthEventTitle(feverEvent.title, feverRecord.content)

  assert.equal(title, '发热')
  assert.equal(deriveHealthEventListSummary(title, feverRecord.content), null)
})

test('长描述提炼为症状关键词，并把额外事实放入摘要', () => {
  const longEvent = { ...event, title: '当时头上有点胀痛，而且有点冒汗' }
  const longRecord = { ...record, content: '当时头上有点胀痛，而且有点冒汗' }
  const title = normalizeHealthEventTitle(longEvent.title, longRecord.content)

  assert.equal(title, '头痛')
  assert.equal(deriveHealthEventListSummary(title, longRecord.content), '伴出汗')
})

test('事件标题保持简短，补充摘要不直接复制标题', () => {
  const coldEvent = { ...event, title: '手脚发凉' }
  const coldRecord = { ...record, content: '手脚发凉' }
  const title = normalizeHealthEventTitle(coldEvent.title, coldRecord.content)

  assert.equal(title, '手脚发凉')
  assert.equal(deriveHealthEventListSummary(title, coldRecord.content), null)
})

test('一级列表优先读取事件摘要层的标题和副标题', () => {
  const summarizedEvent: HealthEventApiDto = {
    ...event,
    eventSummary: {
      systemGenerated: { title: '甲型流感', summary: '系统摘要', tags: [], evidence: ['检查结果'], updatedAt: event.updatedAt },
      userCorrection: null,
      displayedResult: { title: '甲型流感', summary: '发热、头痛，最高体温39℃，检查提示甲型流感。', tags: [], evidence: ['检查结果'], updatedAt: event.updatedAt, source: 'system' },
      hasNewEvidenceAfterCorrection: false
    }
  }
  const [adapted] = adaptHealthEventList([summarizedEvent], [member], new Map([[event.id, [record]]]))
  assert.equal(adapted.title, '甲型流感')
  assert.match(adapted.summary ?? '', /最高体温39℃/)
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
    new Map([[event.id, [attachment]]])
  )

  assert.equal(adapted.title, '检查结果')
  assert.equal(adapted.summary, '血常规报告')
  assert.equal(`${adapted.title}${adapted.summary}`.includes('image.jpg'), false)
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
    [imageEvent], [member], new Map([[event.id, [imageRecord]]]), new Map([[event.id, [attachment]]])
  )
  assert.equal(adapted.title, '图片记录')
  assert.equal(adapted.summary, null)
})

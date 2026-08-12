import assert from 'node:assert/strict'
import test from 'node:test'
import type { FamilyMemberApiDto, HealthEventApiDto, HealthEventRecordApiDto } from '../types/index.ts'
import { deriveHealthEventListSummary, normalizeHealthEventTitle } from './healthEventFacts.ts'
import { getEventOccurredAt } from './healthEventListPresentation.ts'

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

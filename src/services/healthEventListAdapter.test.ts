import assert from 'node:assert/strict'
import test from 'node:test'
import type { FamilyMemberApiDto, HealthEventApiDto, HealthEventRecordApiDto } from '../types/index.ts'
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
  const result = adaptHealthEventList([event], [member], new Map([[event.id, [record]]]))

  assert.equal(result[0].occurredAt, record.occurredAt)
  assert.equal(new Date(result[0].occurredAt).getUTCFullYear(), 2025)
  assert.equal(new Date(result[0].createdAt).getUTCFullYear(), 2026)
})

test('没有 Record 时回退到事件 startTime', () => {
  const result = adaptHealthEventList([event], [member])

  assert.equal(result[0].occurredAt, event.startTime)
})

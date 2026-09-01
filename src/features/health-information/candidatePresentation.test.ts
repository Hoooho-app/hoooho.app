import assert from 'node:assert/strict'
import test from 'node:test'
import { discoveryCardCopy, sourceRecordPath } from './candidatePresentation'
import type { HealthInformationCandidateApiDto } from '../../types'

const candidate = (status: HealthInformationCandidateApiDto['status']): HealthInformationCandidateApiDto => ({
  id: 'candidate-one', memberId: 'member-one', sourceEventId: 'event one', sourceRecordIds: ['record one'], sourceFactIds: ['fact-one'],
  category: 'adverse_reaction', title: '阿莫西林相关反应', description: '记录中提到相关反应', status,
  destinationProfileSection: null, note: null, relatedCandidateId: null, firstDiscoveredAt: '2026-08-30T13:00:00.000Z',
  createdAt: '2026-08-30T13:00:00.000Z', updatedAt: '2026-08-30T13:00:00.000Z', confirmedAt: null, dismissedAt: null, profileFactId: null,
  sourceEvent: { id: 'event one', title: '发热', category: 'fever', startTime: '2026-08-30T13:00:00.000Z' },
  sourceRecords: [{ id: 'record one', occurredAt: '2026-08-30T13:00:00.000Z', sourceType: 'voice_record', content: '吃药后出现皮疹' }]
})

test('入口只展示待确认或已确认信息，不为暂不处理制造提醒', () => {
  assert.equal(discoveryCardCopy([candidate('pending')]).description, '1条信息可能值得长期保存')
  assert.equal(discoveryCardCopy([candidate('confirmed')]).title, '已加入健康档案')
  assert.equal(discoveryCardCopy([candidate('dismissed')]).visible, false)
})

test('来源链接精确定位原事件记录', () => {
  assert.equal(sourceRecordPath(candidate('pending')), '/health-events/event%20one#record-record%20one')
})

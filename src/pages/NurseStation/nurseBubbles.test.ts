import assert from 'node:assert/strict'
import test from 'node:test'
import type { NurseStationItem } from '../../features/nurse-station/state'
import { bubbleItemKey, buildNurseBubbles, isSafetyBubble, visibleNurseBubbles } from './nurseBubbles'

const base = { memberId: 'child', sourceEventId: 'event', relatedEventIds: ['event'], type: 'symptom_observation' as const, status: 'pending_confirmation' as const, title: '值得继续留意', sourceLabel: '发热 · 9/8 10:00', createdAt: '2026-09-08T02:00:00Z', updatedAt: '2026-09-08T02:00:00Z' }
const item = (id: string, changes: Partial<NurseStationItem> = {}): NurseStationItem => ({ ...base, id, ...changes })

test('同类型气泡聚合且同一主题只保留最新内容', () => {
  const bubbles = buildNurseBubbles({ handledKeys: [], items: [item('old'), item('new', { updatedAt: '2026-09-08T03:00:00Z' }), item('cough', { sourceLabel: '咳嗽 · 9/8 11:00' }), item('skin', { sourceLabel: '皮肤变化 · 9/8 12:00' })], tutorialAvailable: false })
  assert.equal(bubbles.length, 1)
  assert.equal(bubbles[0].title, '值得继续留意')
  assert.equal(bubbles[0].count, 3)
})

test('最多显示两个完整气泡，其余聚合为轻量数量', () => {
  const bubbles = buildNurseBubbles({ handledKeys: [], items: [item('safety', { title: '安全提醒：症状明显加重' }), item('attention'), item('tips', { type: 'follow_up', status: 'active' })], medicalPrepEventId: 'event-summary', tutorialAvailable: true })
  const result = visibleNurseBubbles(bubbles)
  assert.equal(result.visible.length, 2)
  assert.equal(result.visible[0].type, 'safety')
  assert.equal(result.hiddenCount, 3)
})

test('处理键只移除护士消息，不改变原任务或健康记录', () => {
  const source = item('attention')
  const bubbles = buildNurseBubbles({ handledKeys: [bubbleItemKey(source)], items: [source], tutorialAvailable: false })
  assert.equal(bubbles.length, 0)
  assert.equal(source.status, 'pending_confirmation')
})

test('安全提醒可识别为不可单次滑动擦除类型', () => {
  const bubble = buildNurseBubbles({ handledKeys: [], items: [item('safety', { title: '安全提醒：需要就医' })], tutorialAvailable: false })[0]
  assert.equal(isSafetyBubble(bubble), true)
})

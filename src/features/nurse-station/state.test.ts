import test from 'node:test'
import assert from 'node:assert/strict'
import { nurseStationStorageKey, reconcileNurseStationItems } from './state.ts'
import type { HealthEventListItemViewModel } from '../../types/index.ts'

test('护士站状态按身份和当前记录对象隔离', () => {
  assert.notEqual(nurseStationStorageKey('guest-1', 'child-a'), nurseStationStorageKey('guest-1', 'child-b'))
  assert.notEqual(nurseStationStorageKey('guest-1', 'child-a'), nurseStationStorageKey('account-1', 'child-a'))
})

test('只有真实且匹配的健康随记产生待确认事项并去重', () => {
  const event = { id: 'event-1', memberId: 'child-a', title: '发热', displayTitle: '发热', category: 'fever', occurredAt: '2026-09-07T10:20:00.000Z', createdAt: '2026-09-07T10:20:00.000Z', updatedAt: '2026-09-07T10:20:00.000Z' } as HealthEventListItemViewModel
  const empty = { tutorialSeen: true, loginNoticeDismissed: false, suppressedTypes: [], handledBubbleKeys: [], animatedBubbleKeys: [], items: [] }
  const once = reconcileNurseStationItems(empty, [event], 'child-a')
  assert.equal(once.items.length, 1)
  assert.equal(once.items[0].status, 'pending_confirmation')
  assert.equal(reconcileNurseStationItems(once, [event], 'child-a').items.length, 1)
})

test('只为当前人物明确开启提醒的药品创建独立任务', () => {
  const empty = { tutorialSeen: true, loginNoticeDismissed: false, suppressedTypes: [], handledBubbleKeys: [], animatedBubbleKeys: [], items: [] }
  const entry = { id: 'record-1', eventId: 'event-1', content: '', occurredAt: '2026-09-09T10:00:00.000Z', createdAt: '2026-09-09T10:00:00.000Z', attachmentCount: 0, status: 'active', categories: ['medication'], medication: { medicationName: 'A', administrationRoute: 'oral', medications: [{ id: 'a', medicationName: 'A', amountValue: 1, amountUnit: '片', dosageStep: 1, reminder: { enabled: true, frequency: 'daily', timesPerDay: 1, times: ['08:00'], durationDays: 5 } }, { id: 'b', medicationName: 'B', amountValue: 2, amountUnit: 'mL', dosageStep: .5, reminder: { enabled: false, frequency: 'daily', timesPerDay: 1, times: ['09:00'], durationDays: 5 } }] } } as never
  const result = reconcileNurseStationItems(empty, [], 'child-a', [entry])
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].id, 'nurse-event-1-a')
  assert.equal(result.items[0].status, 'active')
})

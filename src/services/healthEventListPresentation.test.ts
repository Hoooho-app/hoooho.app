import assert from 'node:assert/strict'
import test from 'node:test'
import type { HealthEventListItemViewModel } from '../types/index.ts'
import { getMemberHealthEvents } from './healthEventListPresentation.ts'

function event(id: string, memberId: string, title: string): HealthEventListItemViewModel {
  return {
    id,
    memberId,
    memberName: memberId,
    title,
    displayTitle: title,
    definitionTitle: '未定性',
    durationLabel: '已持续1天',
    summaryFragments: [],
    category: 'other',
    status: 'observing',
    startTime: '2026-08-29T00:00:00.000Z',
    recoveredAt: null,
    occurredAt: '2026-08-29T00:00:00.000Z',
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z'
  }
}

test('member event scope keeps only exact member matches with valid titles', () => {
  const memberAEvent = event('event-a', 'member-a', '发热')
  const memberBEvent = event('event-b', 'member-b', '咳嗽')
  const emptyTitleEvent = event('event-empty', 'member-a', '   ')

  assert.deepEqual(
    getMemberHealthEvents([memberAEvent, memberBEvent, emptyTitleEvent], 'member-a'),
    [memberAEvent]
  )
})

test('missing or unmatched member scope never falls back to all events', () => {
  const events = [event('event-a', 'member-a', '发热'), event('event-b', 'member-b', '咳嗽')]

  assert.deepEqual(getMemberHealthEvents(events, null), [])
  assert.deepEqual(getMemberHealthEvents(events, undefined), [])
  assert.deepEqual(getMemberHealthEvents(events, ''), [])
  assert.deepEqual(getMemberHealthEvents(events, 'member-missing'), [])
})

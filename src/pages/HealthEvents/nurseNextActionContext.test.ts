import assert from 'node:assert/strict'
import test from 'node:test'
import type { HealthEventListItemViewModel } from '../../types'
import { getNurseNextActionEventId } from './nurseNextActionContext'

const event = (id: string, memberId: string, createdAt: string) => ({
  id,
  memberId,
  createdAt,
} as HealthEventListItemViewModel)

test('护士站下一步只选择当前人物最新创建的健康事件', () => {
  const events = [
    event('older-current', 'current', '2026-08-28T08:00:00.000Z'),
    event('other-member', 'other', '2026-09-01T08:00:00.000Z'),
    event('newer-current', 'current', '2026-08-31T08:00:00.000Z'),
  ]

  assert.equal(getNurseNextActionEventId(events, 'current'), 'newer-current')
  assert.equal(getNurseNextActionEventId(events, 'missing'), null)
})

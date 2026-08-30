import assert from 'node:assert/strict'
import test from 'node:test'
import type { HealthEventListItemViewModel } from '../types'
import { getHealthEventDefinitionTitleOptions } from './healthEventFilterOptions'

function event(definitionTitle: string): HealthEventListItemViewModel {
  return {
    id: definitionTitle,
    memberId: 'member-1',
    memberName: '刘磊',
    title: '原始事件标题',
    displayTitle: '原始事件标题',
    definitionTitle,
    durationLabel: '已持续1天',
    summaryFragments: [],
    category: 'other',
    status: 'observing',
    startTime: '2026-08-28T00:00:00+08:00',
    recoveredAt: null,
    occurredAt: '2026-08-28T00:00:00+08:00',
    createdAt: '2026-08-28T00:00:00+08:00',
    updatedAt: '2026-08-28T00:00:00+08:00'
  }
}

test('事件类型选项使用列表展示标题并按首次出现顺序去重', () => {
  const options = getHealthEventDefinitionTitleOptions([
    event('荨麻疹'),
    event('未定性'),
    event('荨麻疹'),
    event('  ')
  ])

  assert.deepEqual(options, ['荨麻疹', '未定性'])
})

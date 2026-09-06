import assert from 'node:assert/strict'
import test from 'node:test'
import { exactDurationMinutes, outdoorActivitySummary, toggleChoice, toggleExclusive } from './outdoorActivityLogic.ts'

test('outdoor activity multi-select and none-observed choices are deterministic', () => {
  assert.deepEqual(toggleChoice(['walking'], 'free_play'), ['walking', 'free_play'])
  assert.deepEqual(toggleExclusive(['plants_pollen'], 'none_observed', 'none_observed'), ['none_observed'])
  assert.deepEqual(toggleExclusive(['none_observed'], 'cold_air', 'none_observed'), ['cold_air'])
})

test('exact duration is bounded and produces the timeline summary', () => {
  assert.equal(exactDurationMinutes('0', '45'), 45)
  assert.equal(exactDurationMinutes('24', '1'), undefined)
  assert.equal(outdoorActivitySummary({ activities: ['free_play', 'running_jumping'], places: ['park', 'grassland'], contacts: ['plants_pollen'], observations: ['runny_nose_sneeze'], durationMinutes: 45 }), '户外活动\n公园、草地 · 自由玩耍、跑跳 · 45分钟\n草木或花粉、流鼻涕或打喷嚏')
})

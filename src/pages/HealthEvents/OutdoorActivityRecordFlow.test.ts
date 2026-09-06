import assert from 'node:assert/strict'
import test from 'node:test'
import { outdoorActivitySummary, toggleChoice, toggleExclusive } from './outdoorActivityLogic.ts'

test('outdoor activity multi-select and none-observed choices are deterministic', () => {
  assert.deepEqual(toggleChoice(['walking'], 'free_play'), ['walking', 'free_play'])
  assert.deepEqual(toggleExclusive(['plants_pollen'], 'none_observed', 'none_observed'), ['none_observed'])
  assert.deepEqual(toggleExclusive(['none_observed'], 'cold_air', 'none_observed'), ['cold_air'])
})

test('duration range produces the timeline summary without a place section', () => {
  assert.equal(outdoorActivitySummary({ activities: ['free_play', 'running_jumping'], places: [], contacts: ['plants_pollen'], observations: ['runny_nose_sneeze'], durationRange: '30_60' }), '户外活动\n自由玩耍、跑跳 · 30–60分钟\n草木或花粉、流鼻涕或打喷嚏')
})

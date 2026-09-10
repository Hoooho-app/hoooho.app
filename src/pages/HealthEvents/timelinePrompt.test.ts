import assert from 'node:assert/strict'
import test from 'node:test'
import { getTimelinePrompt } from './timelinePrompt.ts'

const at = (hour: number) => new Date(2026, 8, 11, hour, 20)

test('creates the six contextual prompts and injects the current member name', () => {
  assert.equal(getTimelinePrompt(at(6), '安安', '2026-09-11', '2026-09-11', [])?.question, '安安昨晚睡得怎么样？')
  assert.equal(getTimelinePrompt(at(9), '安安', '2026-09-11', '2026-09-11', [])?.target, 'diet')
  assert.equal(getTimelinePrompt(at(12), '安安', '2026-09-11', '2026-09-11', [])?.eyebrow, '到中午啦')
  assert.equal(getTimelinePrompt(at(15), '安安', '2026-09-11', '2026-09-11', [])?.mode, 'nap')
  assert.equal(getTimelinePrompt(at(18), '安安', '2026-09-11', '2026-09-11', [])?.target, 'activity')
  assert.equal(getTimelinePrompt(at(21), '安安', '2026-09-11', '2026-09-11', [])?.mode, 'start')
})

test('historical days always use backfill and relevant records suppress the prompt', () => {
  assert.equal(getTimelinePrompt(at(21), '安安', '2026-09-10', '2026-09-11', [])?.mode, 'backfill')
  assert.equal(getTimelinePrompt(at(9), '安安', '2026-09-11', '2026-09-11', [{ categories: ['diet'], occurredAt: '2026-09-11T08:00:00.000Z' } as never]), null)
})


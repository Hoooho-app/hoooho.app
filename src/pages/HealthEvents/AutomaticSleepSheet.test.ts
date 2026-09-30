import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { automaticSleepDraft } from './automaticSleepDraft.ts'
import type { RoutineTrack } from '../../services/routineTracks'

describe('automatic sleep legacy compatibility', () => {
  const track = { day: '2026-09-30', time: '21:10', endTime: '06:00', timeZone: 'Asia/Shanghai' } as RoutineTrack
  it('fills an absent legacy expected wake without declaring actual completion', () => {
    const draft = automaticSleepDraft({ ...track, sleep: { sleepAt: '2026-09-30T13:10:00.000Z', status: 'ongoing', kind: 'night', quality: '睡得安稳' } as RoutineTrack['sleep'] })
    assert.equal(draft.wakeAt, '2026-09-30T22:00:00.000Z')
    assert.equal(draft.durationMinutes, 530)
    assert.equal(draft.status, 'ongoing')
    assert.equal(draft.quality, '睡得安稳')
  })
  it('preserves saved full datetimes and explicit completion', () => {
    const sleep = { sleepAt: '2026-09-30T05:00:00.000Z', wakeAt: '2026-10-01T06:30:00.000Z', status: 'completed', kind: 'nap', timeZone: 'Asia/Shanghai' } as RoutineTrack['sleep']
    assert.deepEqual(automaticSleepDraft({ ...track, sleep }), { ...sleep, durationMinutes: 1530 })
  })
})

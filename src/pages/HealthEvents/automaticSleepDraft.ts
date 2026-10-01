import type { RoutineTrack } from '../../services/routineTracks'
import type { SleepDraft } from './SleepRecordFlow'
import { SLEEP_CLOCK, sleepInstant } from './sleepEditorTime'

export function automaticSleepDraft(track: RoutineTrack): SleepDraft {
  const day = new Date(`${track.day}T12:00:00Z`)
  if (track.endTime && track.endTime <= track.time) day.setUTCDate(day.getUTCDate() + 1)
  const timeZone = track.sleep?.timeZone ?? track.timeZone ?? SLEEP_CLOCK.timeZone
  const sleepAt = track.sleep?.sleepAt ?? sleepInstant(`${track.day}T${track.time}`, timeZone)
  const projectedWakeAt = sleepInstant(`${day.toISOString().slice(0, 10)}T${track.endTime ?? track.time}`, timeZone)
  // Only fill missing legacy expected values; never rewrite a supplied endpoint.
  const wakeAt = track.sleep?.wakeAt || (Date.parse(projectedWakeAt) > Date.parse(sleepAt) ? projectedWakeAt : new Date(Date.parse(sleepAt) + 480 * 60000).toISOString())
  // Passing an expected wake time does not provide actual-completion evidence.
  return { kind: 'night', status: 'ongoing', ...track.sleep, timeZone, sleepAt, wakeAt, durationMinutes: (Date.parse(wakeAt) - Date.parse(sleepAt)) / 60000 }
}

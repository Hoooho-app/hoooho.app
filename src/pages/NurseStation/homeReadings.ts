import type { FamilyMemberApiDto, GrowthMeasurementApiDto } from '../../types'
import type { MedicationReminderDto } from '../../services/medicationReminders'

type Readings = { member: FamilyMemberApiDto; growth: GrowthMeasurementApiDto[]; medication: MedicationReminderDto[]; followUpCount: number }
type Entries = Partial<{ [K in keyof Readings]: { value: Readings[K]; readAt: number } }>
let owner = ''
const readings = new Map<string, Entries>()
const freshness = 5 * 60_000
// Success-only, memory-only cache. Session changes discard it; reads never cross members.
function selectSession(token: string) {
  if (token !== owner) { readings.clear(); owner = token }
}
export function readHomeReading<K extends keyof Readings>(token: string, memberId: string, kind: K): Readings[K] | undefined {
  selectSession(token)
  if (!token || !memberId) return undefined
  const entry = readings.get(memberId)?.[kind]
  return entry && Date.now() - entry.readAt < freshness ? entry.value : undefined
}
export function writeHomeReading<K extends keyof Readings>(token: string, memberId: string, kind: K, value: Readings[K]) {
  selectSession(token)
  if (token && memberId) readings.set(memberId, { ...readings.get(memberId), [kind]: { value, readAt: Date.now() } })
}

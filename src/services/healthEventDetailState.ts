import type { HealthEventRecordApiDto } from '../types'

export function hasPersistedHealthEventRecords(
  records: readonly HealthEventRecordApiDto[]
): boolean {
  return records.length > 0
}

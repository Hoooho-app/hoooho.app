import type { HealthEventApiDto, HealthEventRecordApiDto } from '../types'

export function getEventOccurredAt(event: HealthEventApiDto, records: readonly HealthEventRecordApiDto[]) {
  if (records.length === 0) return event.startTime
  return records.reduce(
    (earliest, record) => record.occurredAt < earliest ? record.occurredAt : earliest,
    records[0].occurredAt
  )
}

export function getPrimaryRecord(records: readonly HealthEventRecordApiDto[]) {
  return [...records].sort((left, right) => (
    left.occurredAt.localeCompare(right.occurredAt)
      || left.createdAt.localeCompare(right.createdAt)
      || left.id.localeCompare(right.id)
  ))[0]
}

import type { HealthEventApiDto, HealthEventListItemViewModel, HealthEventRecordApiDto } from '../types'

export function getMemberHealthEvents(
  events: readonly HealthEventListItemViewModel[],
  memberId: string | null | undefined
) {
  if (!memberId) return []
  return events.filter((event) => event.memberId === memberId && event.title.trim().length > 0)
}

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

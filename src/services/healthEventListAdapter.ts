import type { FamilyMemberApiDto, HealthEventApiDto, HealthEventListItemViewModel, HealthEventRecordApiDto } from '../types'

function getEventOccurredAt(event: HealthEventApiDto, records: readonly HealthEventRecordApiDto[]) {
  if (records.length === 0) return event.startTime
  return records.reduce(
    (earliest, record) => record.occurredAt < earliest ? record.occurredAt : earliest,
    records[0].occurredAt
  )
}

export function adaptHealthEventList(
  events: HealthEventApiDto[],
  members: FamilyMemberApiDto[],
  recordsByEventId: ReadonlyMap<string, readonly HealthEventRecordApiDto[]> = new Map()
): HealthEventListItemViewModel[] {
  const memberNames = new Map(members.map((member) => [member.id, member.name]))
  return events.map((event) => ({
    id: event.id,
    memberId: event.memberId,
    memberName: memberNames.get(event.memberId) ?? '未知成员',
    title: event.title,
    category: event.category,
    status: event.status,
    startTime: event.startTime,
    occurredAt: getEventOccurredAt(event, recordsByEventId.get(event.id) ?? []),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt
  }))
}

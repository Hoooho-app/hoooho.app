import type { FamilyMemberApiDto, HealthEventApiDto, HealthEventListItemViewModel, HealthEventRecordApiDto } from '../types'
import { deriveHealthEventListSummary, normalizeHealthEventTitle } from './healthEventFacts'
import { getEventOccurredAt, getPrimaryRecord } from './healthEventListPresentation'

export function adaptHealthEventList(
  events: HealthEventApiDto[],
  members: FamilyMemberApiDto[],
  recordsByEventId: ReadonlyMap<string, readonly HealthEventRecordApiDto[]> = new Map()
): HealthEventListItemViewModel[] {
  const memberNames = new Map(members.map((member) => [member.id, member.name]))
  return events.map((event) => {
    const records = recordsByEventId.get(event.id) ?? []
    const primaryRecord = getPrimaryRecord(records)
    const projectedSummary = event.eventSummary?.displayedResult
    const title = projectedSummary?.title ?? normalizeHealthEventTitle(event.title, primaryRecord?.content)
    return ({
    id: event.id,
    memberId: event.memberId,
    memberName: memberNames.get(event.memberId) ?? '未知成员',
    title,
    summary: projectedSummary
      ? projectedSummary.summary.slice(0, 52)
      : deriveHealthEventListSummary(title, primaryRecord?.content),
    category: event.category,
    status: event.status,
    startTime: event.startTime,
    occurredAt: getEventOccurredAt(event, records),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt
    })
  })
}

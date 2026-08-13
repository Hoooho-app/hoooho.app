import type { EventAttachmentApiDto, FamilyMemberApiDto, HealthEventApiDto, HealthEventListItemViewModel, HealthEventRecordApiDto } from '../types'
import { deriveHealthEventListSummary, normalizeHealthEventTitle } from './healthEventFacts'
import { getEventOccurredAt, getPrimaryRecord } from './healthEventListPresentation'
import { getImageRecordSummary, getImageRecordTitle, isLegacyAttachmentTitle } from './imageAnalysisPresentation'

export function adaptHealthEventList(
  events: HealthEventApiDto[],
  members: FamilyMemberApiDto[],
  recordsByEventId: ReadonlyMap<string, readonly HealthEventRecordApiDto[]> = new Map(),
  attachmentsByEventId: ReadonlyMap<string, readonly EventAttachmentApiDto[]> = new Map()
): HealthEventListItemViewModel[] {
  const memberNames = new Map(members.map((member) => [member.id, member.name]))
  return events.map((event) => {
    const records = recordsByEventId.get(event.id) ?? []
    const primaryRecord = getPrimaryRecord(records)
    const attachments = attachmentsByEventId.get(event.id) ?? []
    const projectedSummary = event.eventSummary?.displayedResult
    const title = projectedSummary?.title
      ?? (attachments.length && isLegacyAttachmentTitle(event.title)
        ? getImageRecordTitle(attachments)
        : normalizeHealthEventTitle(event.title, primaryRecord?.content))
    return ({
    id: event.id,
    memberId: event.memberId,
    memberName: memberNames.get(event.memberId) ?? '未知成员',
    title,
    summary: projectedSummary
      ? projectedSummary.summary.slice(0, 52)
      : getImageRecordSummary(attachments) ?? deriveHealthEventListSummary(title, primaryRecord?.content),
    category: event.category,
    status: event.status,
    startTime: event.startTime,
    occurredAt: getEventOccurredAt(event, records),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt
    })
  })
}

import type { EventAttachmentApiDto, FamilyMemberApiDto, HealthEventApiDto, HealthEventListItemViewModel, HealthEventRecordApiDto } from '../types'
import {
  formatHealthEventDuration,
  getHealthEventDefinitionTitle,
  getHealthEventDisplayTitle,
  getHealthEventStartDate,
  getHealthEventSummaryFragments
} from './healthEventCardPresentation'
import { normalizeHealthEventTitle } from './healthEventFacts'
import { getEventOccurredAt, getPrimaryRecord } from './healthEventListPresentation'
import { getImageRecordSummary, getImageRecordTitle, isLegacyAttachmentTitle } from './imageAnalysisPresentation'

export function adaptHealthEventList(
  events: HealthEventApiDto[],
  members: FamilyMemberApiDto[],
  recordsByEventId: ReadonlyMap<string, readonly HealthEventRecordApiDto[]> = new Map(),
  attachmentsByEventId: ReadonlyMap<string, readonly EventAttachmentApiDto[]> = new Map(),
  now = new Date()
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
    const startTime = getHealthEventStartDate(event.startTime, records.map((record) => record.occurredAt)) ?? event.startTime
    return ({
    id: event.id,
    memberId: event.memberId,
    memberName: memberNames.get(event.memberId) ?? '未知成员',
    title,
    displayTitle: getHealthEventDisplayTitle(title, projectedSummary),
    definitionTitle: getHealthEventDefinitionTitle(projectedSummary),
    durationLabel: formatHealthEventDuration({
      startTime,
      recoveredAt: event.recoveredAt,
      status: event.status,
      now
    }),
    summaryFragments: getHealthEventSummaryFragments({
      status: event.status,
      summary: projectedSummary,
      fallbackFeature: projectedSummary ? null : getImageRecordSummary(attachments) ?? title,
      fallbackRecordId: primaryRecord?.id
    }),
    category: event.category,
    status: event.status,
    startTime,
    recoveredAt: event.recoveredAt ?? null,
    occurredAt: getEventOccurredAt(event, records),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt
    })
  })
}

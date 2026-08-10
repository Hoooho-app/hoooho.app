import type {
  FamilyMemberApiDto,
  EventAttachmentApiDto,
  EventAttachment,
  HealthEvent,
  HealthEventApiDto,
  HealthEventDetailViewModel,
  HealthEventRecordApiDto,
  OrganizedHealthData,
  HealthRecordOrganizationApiDto,
  Member,
  MemberRelation,
  TimelineEntry
} from '../types'
import { formatAgeFromBirthday } from '../utils/formatAgeFromBirthday'
import { createVirtualAvatarId } from '../utils/virtualAvatar'
import { formatHealthTimePeriod } from '../utils/formatHealthTimePeriod'

const relationLabels: Record<FamilyMemberApiDto['relationship'], MemberRelation> = {
  self: '本人',
  child: '子女',
  parent: '父亲',
  spouse: '配偶',
  other: '其他'
}

const emptyMedicalInfo = {
  allergies: [],
  medications: [],
  medicalHistory: [],
  chronicDiseases: [],
  familyHistory: []
}

const compareRecords = (left: HealthEventRecordApiDto, right: HealthEventRecordApiDto) => (
  left.occurredAt.localeCompare(right.occurredAt)
  || left.createdAt.localeCompare(right.createdAt)
  || left.id.localeCompare(right.id)
)

function toTimelineEntry(record: HealthEventRecordApiDto): TimelineEntry {
  return {
    id: record.id,
    time: record.occurredAt,
    periodLabel: formatHealthTimePeriod(undefined, record.occurredAt),
    content: record.content,
    recordType: record.type,
    kind: record.type === 'medication' ? 'medication' : 'text',
    sourceRecordId: record.id,
    sequence: 0,
    segments: [{ label: recordLabel(record.type), content: record.content }],
    attachments: []
  }
}

export function adaptFamilyMember(member: FamilyMemberApiDto): Member {
  const canGenerateAvatar = Boolean(member.birthday && (member.gender === 'male' || member.gender === 'female'))

  return {
    id: member.id,
    name: member.name,
    relation: relationLabels[member.relationship],
    birthday: member.birthday ?? undefined,
    gender: member.gender ?? '',
    avatar: canGenerateAvatar
      ? createVirtualAvatarId(member.birthday!, member.gender!)
      : member.avatar ?? undefined,
    age: member.birthday ? formatAgeFromBirthday(member.birthday) : '未填写年龄'
  }
}

export function adaptHealthEventDetail(
  eventDto: HealthEventApiDto,
  recordDtos: HealthEventRecordApiDto[],
  organizationDtos: HealthRecordOrganizationApiDto[] = [],
  attachmentDtos: EventAttachmentApiDto[] = []
): HealthEventDetailViewModel {
  const sortedRecords = [...recordDtos].sort(compareRecords)
  const displayStatus: HealthEvent['status'] = eventDto.status === 'recovered'
    ? 'recovered'
    : sortedRecords.length
      ? 'ongoing'
      : 'empty'
  const organizedData = organizationDtos.map((organization) => (
    organization.confirmedData ?? organization.organizedHealthData
  ))
  const organizedSymptoms = uniqueText(organizedData.flatMap((data) => data.symptoms.map((fact) => fact.content)))
  const organizedRecordIds = new Set(organizationDtos.map((organization) => organization.recordId))
  const unorganizedSymptoms = sortedRecords
    .filter((record) => record.type === 'symptom' && !organizedRecordIds.has(record.id))
    .map((record) => record.content)
  const symptoms = uniqueText([...organizedSymptoms, ...unorganizedSymptoms])
  const medications = uniqueText(organizedData.flatMap((data) => data.medications.map((fact) => fact.content)))
  const visits = uniqueText(organizedData.flatMap((data) => data.visits.map((fact) => fact.content)))
  const examinations = uniqueText(organizedData.flatMap((data) => data.examinations.map((fact) => fact.content)))
  const concerns = uniqueText(organizedData.flatMap((data) => data.concerns.map((fact) => fact.content)))
  const adaptedAttachments = attachmentDtos.map(adaptAttachment)
  const temperatureRecords = buildTemperatureRecords(organizationDtos, sortedRecords)
  const timeline = buildTimeline(sortedRecords, organizationDtos, adaptedAttachments)

  return {
    category: eventDto.category,
    stage: eventDto.status,
    event: {
      id: eventDto.id,
      memberId: eventDto.memberId,
      title: eventDto.title,
      status: displayStatus,
      startDate: eventDto.startTime,
      symptoms,
      summary: '',
      medications,
      visits,
      examinations,
      timeline,
      temperatureRecords,
      attachments: adaptedAttachments,
      concerns,
      personalizedModules: [],
      medicalInfo: emptyMedicalInfo,
      ...(eventDto.status === 'recovered'
        ? {
            recoveryInfo: {
              recoveredAt: eventDto.updatedAt,
              result: '已恢复',
              note: ''
            }
          }
        : {})
    }
  }
}

function uniqueText(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function buildTemperatureRecords(
  organizations: HealthRecordOrganizationApiDto[],
  records: HealthEventRecordApiDto[]
) {
  const occurredAtByRecord = new Map(records.map((record) => [record.id, record.occurredAt]))
  return organizations.map((organization) => {
    const data = organization.confirmedData ?? organization.organizedHealthData
    const temperature = data.temperature
    if (!temperature) return null
    const time = occurredAtByRecord.get(organization.recordId) ?? organization.createdAt ?? ''
    if (!time) return null
    const label = temperature.min === temperature.max
      ? `${temperature.min}℃`
      : `${temperature.min}-${temperature.max}℃`
    return {
      time,
      value: (temperature.min + temperature.max) / 2,
      min: temperature.min,
      max: temperature.max,
      label,
      periodLabel: formatHealthTimePeriod(data.timeline[0]?.time, time)
    }
  }).filter((record): record is NonNullable<typeof record> => Boolean(record))
}

function buildTimeline(
  records: HealthEventRecordApiDto[],
  organizations: HealthRecordOrganizationApiDto[],
  attachments: EventAttachment[]
): TimelineEntry[] {
  const organizationByRecord = new Map(organizations.map((organization) => [organization.recordId, organization]))
  const attachmentsByRecord = new Map<string, EventAttachment[]>()
  for (const attachment of attachments) {
    if (!attachment.recordId) continue
    attachmentsByRecord.set(attachment.recordId, [...(attachmentsByRecord.get(attachment.recordId) ?? []), attachment])
  }

  return records.flatMap((record) => {
    const organization = organizationByRecord.get(record.id)
    if (!organization) {
      const entry = toTimelineEntry(record)
      entry.attachments = attachmentsByRecord.get(record.id) ?? []
      return [entry]
    }

    const data = organization.confirmedData ?? organization.organizedHealthData
    const timelineItems = data.timeline.length ? data.timeline : [{ time: '', content: record.content, relatedSymptoms: [] }]
    return timelineItems.map((item, index) => ({
      id: `${organization.id}-timeline-${index}`,
      time: record.occurredAt,
      displayTime: item.time,
      periodLabel: formatHealthTimePeriod(item.time, record.occurredAt),
      content: item.content,
      recordType: record.type,
      kind: record.type === 'medication' ? 'medication' : 'text',
      sourceRecordId: record.id,
      sequence: index,
      segments: buildTimelineSegments(item.content, item.relatedSymptoms, data, record.type),
      attachments: index === 0 ? attachmentsByRecord.get(record.id) ?? [] : []
    }))
  })
}

function adaptAttachment(attachment: EventAttachmentApiDto): EventAttachment {
  return {
    id: attachment.id,
    name: attachment.name,
    type: 'image',
    url: attachment.dataUrl,
    recordId: attachment.recordId
  }
}

function recordLabel(type: HealthEventRecordApiDto['type']): NonNullable<TimelineEntry['segments']>[number]['label'] {
  if (type === 'symptom') return '症状'
  if (type === 'medication') return '用药'
  if (type === 'visit') return '就诊'
  if (type === 'examination') return '检查'
  return '记录'
}

function buildTimelineSegments(
  content: string,
  relatedSymptoms: string[],
  data: OrganizedHealthData,
  recordType: HealthEventRecordApiDto['type']
): NonNullable<TimelineEntry['segments']> {
  const clauses = content.split(/[，,；;。]/).map((item) => item.trim()).filter(Boolean)
  const segments = clauses.map((clause) => ({ label: classifyClause(clause, relatedSymptoms, data, recordType), content: clause }))
  return segments.length ? segments : [{ label: recordLabel(recordType), content }]
}

function classifyClause(
  clause: string,
  relatedSymptoms: string[],
  data: OrganizedHealthData,
  recordType: HealthEventRecordApiDto['type']
): NonNullable<TimelineEntry['segments']>[number]['label'] {
  if (/体温|\d{2}(?:\.\d)?\s*(?:度|℃)|发热|发烧/.test(clause)) return '体温'
  if (/服用|吃了?|用药|药物|药片|美林|布洛芬|感冒药|退烧药/.test(clause)) return '用药'
  if (/检查|化验|验血|血常规|报告|结果/.test(clause)) return '检查'
  if (/就诊|医院|门诊|医生/.test(clause)) return '就诊'
  if (relatedSymptoms.some((symptom) => clause.includes(symptom)) || data.symptoms.some((fact) => fact.keywords.some((keyword) => clause.includes(keyword)))) return '症状'
  return recordLabel(recordType)
}

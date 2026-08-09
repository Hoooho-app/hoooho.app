import type {
  FamilyMemberApiDto,
  EventAttachmentApiDto,
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
    content: record.content,
    recordType: record.type,
    kind: record.type === 'medication' ? 'medication' : 'text'
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
  const temperatureRecords = buildTemperatureRecords(organizedData, organizationDtos, sortedRecords)
  const timeline = buildTimeline(sortedRecords, organizationDtos)

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
      attachments: attachmentDtos.map((attachment) => ({ id: attachment.id, name: attachment.name, type: 'image', url: attachment.dataUrl })),
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
  organizedData: OrganizedHealthData[],
  organizations: HealthRecordOrganizationApiDto[],
  records: HealthEventRecordApiDto[]
) {
  const occurredAtByRecord = new Map(records.map((record) => [record.id, record.occurredAt]))
  return organizedData.map((data, index) => {
    const temperature = data.temperature
    if (!temperature) return null
    const time = occurredAtByRecord.get(organizations[index]?.recordId) ?? organizations[index]?.createdAt ?? ''
    if (!time) return null
    const label = temperature.min === temperature.max
      ? `${temperature.min}℃`
      : `${temperature.min}-${temperature.max}℃`
    return {
      time,
      value: (temperature.min + temperature.max) / 2,
      min: temperature.min,
      max: temperature.max,
      label
    }
  }).filter((record): record is NonNullable<typeof record> => Boolean(record))
}

function buildTimeline(
  records: HealthEventRecordApiDto[],
  organizations: HealthRecordOrganizationApiDto[]
): TimelineEntry[] {
  const organizationByRecord = new Map(organizations.map((organization) => [organization.recordId, organization]))

  return records.flatMap((record) => {
    const organization = organizationByRecord.get(record.id)
    if (!organization) return [toTimelineEntry(record)]

    const data = organization.confirmedData ?? organization.organizedHealthData
    return data.timeline.map((item, index) => ({
      id: `${organization.id}-timeline-${index}`,
      time: record.occurredAt,
      displayTime: item.time,
      content: item.content,
      recordType: record.type,
      kind: record.type === 'medication' ? 'medication' : 'text'
    }))
  })
}

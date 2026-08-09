import type {
  FamilyMemberApiDto,
  HealthEvent,
  HealthEventApiDto,
  HealthEventDetailViewModel,
  HealthEventRecordApiDto,
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
  recordDtos: HealthEventRecordApiDto[]
): HealthEventDetailViewModel {
  const sortedRecords = [...recordDtos].sort(compareRecords)
  const displayStatus: HealthEvent['status'] = eventDto.status === 'recovered'
    ? 'recovered'
    : sortedRecords.length
      ? 'ongoing'
      : 'empty'
  const symptomRecords = sortedRecords.filter((record) => record.type === 'symptom')

  return {
    category: eventDto.category,
    stage: eventDto.status,
    event: {
      id: eventDto.id,
      memberId: eventDto.memberId,
      title: eventDto.title,
      status: displayStatus,
      startDate: eventDto.startTime,
      symptoms: symptomRecords.map((record) => record.content),
      summary: '',
      timeline: sortedRecords.map(toTimelineEntry),
      temperatureRecords: [],
      attachments: [],
      concerns: [],
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

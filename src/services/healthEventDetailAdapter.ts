import type {
  EventAttachment,
  EventAttachmentApiDto,
  FamilyMemberApiDto,
  HealthEvent,
  HealthEventApiDto,
  HealthEventDetailViewModel,
  HealthEventRecordApiDto,
  HealthFact,
  HealthFactType,
  HealthRecordOrganizationApiDto,
  Member,
  MemberRelation,
  TimelineEntry
} from '../types'
import { formatAgeFromBirthday } from '../utils/formatAgeFromBirthday'
import { createVirtualAvatarId } from '../utils/virtualAvatar'
import { formatHealthTimePeriod } from '../utils/formatHealthTimePeriod'
import { compareHealthChronologyDesc } from './healthChronology'

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

interface FactContext {
  organization: HealthRecordOrganizationApiDto
  record?: HealthEventRecordApiDto
  fact: HealthFact
  factIndex: number
}

export function adaptFamilyMember(member: FamilyMemberApiDto): Member {
  const canGenerateAvatar = Boolean(member.birthday && (member.gender === 'male' || member.gender === 'female'))

  return {
    id: member.id,
    name: member.name,
    relation: relationLabels[member.relationship],
    birthday: member.birthday ?? undefined,
    gender: member.gender ?? '',
    avatar: member.avatar ?? (canGenerateAvatar
      ? createVirtualAvatarId(member.birthday!, member.gender!)
      : undefined),
    heightCm: member.heightCm ?? undefined,
    weightKg: member.weightKg ?? undefined,
    bloodType: member.bloodType ?? undefined,
    waistCircumferenceCm: member.waistCircumferenceCm ?? undefined,
    bodyFatPercentage: member.bodyFatPercentage ?? undefined,
    headCircumferenceCm: member.headCircumferenceCm ?? undefined,
    rhBloodType: member.rhBloodType ?? undefined,
    age: member.birthday ? formatAgeFromBirthday(member.birthday) : '未填写年龄'
  }
}

export function adaptHealthEventDetail(
  eventDto: HealthEventApiDto,
  recordDtos: HealthEventRecordApiDto[],
  organizationDtos: HealthRecordOrganizationApiDto[] = [],
  attachmentDtos: EventAttachmentApiDto[] = []
): HealthEventDetailViewModel {
  const recordsById = new Map(recordDtos.map((record) => [record.id, record]))
  const organizationFacts = organizationDtos.flatMap((organization) => (
    (organization.healthAIOutput?.facts ?? []).map((fact, factIndex) => ({
      organization,
      record: recordsById.get(organization.recordId),
      fact,
      factIndex
    }))
  ))
  const attachmentFacts = attachmentDtos.flatMap((attachment) => (
    (attachment.analysis?.extractedFacts ?? []).map((fact, factIndex): FactContext => ({
      organization: {
        id: `attachment-analysis-${attachment.id}`,
        accountId: attachment.accountId,
        eventId: attachment.eventId,
        recordId: attachment.recordId ?? '',
        rawInput: '',
        healthAIOutput: {
          facts: attachment.analysis?.extractedFacts ?? [],
          confidence: attachment.analysis?.confidence ?? 0,
          parserVersion: 'image-analysis-v1',
          promptVersion: 'health-image-observation-v1',
          timeConflict: { hasConflict: false, conflict: null }
        },
        organizedHealthData: {
          symptoms: [], temperature: null, medications: [], visits: [], examinations: [], concerns: [], attachments: [], timeline: []
        },
        confirmedData: null,
        status: 'completed',
        provider: attachment.analysis?.provider ?? 'unavailable',
        createdAt: attachment.createdAt,
        updatedAt: attachment.analysis?.analyzedAt ?? attachment.createdAt
      },
      record: attachment.recordId ? recordsById.get(attachment.recordId) : undefined,
      fact,
      factIndex
    }))
  ))
  const facts = [...organizationFacts, ...attachmentFacts]
  const adaptedAttachments = attachmentDtos.map(adaptAttachment)
  const timeline = buildFactTimeline(facts, recordDtos, adaptedAttachments)
  const temperatureRecords = buildTemperatureRecords(facts)
  const displayStatus: HealthEvent['status'] = eventDto.status === 'recovered'
    ? 'recovered'
    : timeline.length
      ? 'ongoing'
      : 'empty'

  return {
    category: eventDto.category,
    stage: eventDto.status,
    hasTimeConflict: organizationDtos.some((organization) => organization.healthAIOutput?.timeConflict?.hasConflict),
    event: {
      id: eventDto.id,
      memberId: eventDto.memberId,
      title: eventDto.title,
      status: displayStatus,
      startDate: eventDto.startTime,
      symptoms: uniqueFactNames(facts, 'symptom'),
      summary: '',
      medications: uniqueFactNames(facts, 'medication'),
      visits: uniqueFactNames(facts, 'visit'),
      examinations: uniqueFactNames(facts, 'examination'),
      timeline,
      temperatureRecords,
      attachments: adaptedAttachments,
      concerns: uniqueFactNames(facts, 'concern'),
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

function uniqueFactNames(facts: FactContext[], type: HealthFactType) {
  return uniqueText(facts.filter((item) => item.fact.type === type).map((item) => item.fact.name))
}

function factTime(item: FactContext) {
  return item.fact.time.resolvedStart
    ?? item.record?.occurredAt
    ?? item.organization.createdAt
}

function factCreatedAt(item: FactContext) {
  return item.record?.createdAt ?? item.organization.createdAt
}

function buildTemperatureRecords(facts: FactContext[]) {
  return facts.filter((item) => item.fact.type === 'temperature' && item.fact.temperature)
    .sort((left, right) => compareHealthChronologyDesc(
      { id: left.fact.id, occurredAt: factTime(left), createdAt: factCreatedAt(left) },
      { id: right.fact.id, occurredAt: factTime(right), createdAt: factCreatedAt(right) }
    ))
    .map((item) => {
    const temperature = item.fact.temperature!
    const time = factTime(item)
    const label = temperature.min === temperature.max
      ? `${temperature.min}℃`
      : `${temperature.min}-${temperature.max}℃`
    return {
      time,
      value: (temperature.min + temperature.max) / 2,
      min: temperature.min,
      max: temperature.max,
      label,
      periodLabel: factPeriodLabel(item.fact, time)
    }
    })
}

function buildFactTimeline(
  facts: FactContext[],
  records: HealthEventRecordApiDto[],
  attachments: EventAttachment[]
): TimelineEntry[] {
  const attachmentsByRecord = new Map<string, EventAttachment[]>()
  for (const attachment of attachments) {
    if (!attachment.recordId) continue
    attachmentsByRecord.set(attachment.recordId, [...(attachmentsByRecord.get(attachment.recordId) ?? []), attachment])
  }
  const recordsWithFacts = new Set(facts.map((item) => item.organization.recordId))

  const factEntries = facts.map((item): TimelineEntry => {
    const time = factTime(item)
    const content = factDisplayContent(item.fact)
    return {
      id: `${item.organization.id}-${item.fact.id}`,
      time,
      createdAt: factCreatedAt(item),
      displayTime: item.fact.time.raw ?? undefined,
      periodLabel: factPeriodLabel(item.fact, time),
      content,
      recordType: factRecordType(item.fact.type),
      kind: item.fact.type === 'temperature' ? 'temperature' : item.fact.type === 'medication' ? 'medication' : 'text',
      sourceRecordId: item.organization.recordId,
      sequence: item.factIndex,
      segments: factSegments(item.fact),
      attachments: item.factIndex === 0 ? attachmentsByRecord.get(item.organization.recordId) ?? [] : []
    }
  })

  const attachmentOnlyEntries = records.filter((record) => (
    !recordsWithFacts.has(record.id) && (attachmentsByRecord.get(record.id)?.length ?? 0) > 0
  )).map((record): TimelineEntry => {
    const recordAttachments = attachmentsByRecord.get(record.id) ?? []
    const analyzed = recordAttachments.find((attachment) => attachment.analysis?.status === 'completed')
    const presentation = attachmentPresentation(analyzed)
    return ({
    id: `${record.id}-attachments`,
    time: record.occurredAt,
    createdAt: record.createdAt,
    periodLabel: formatHealthTimePeriod(undefined, record.occurredAt),
    content: presentation.content,
    recordType: 'note',
    kind: 'text',
    sourceRecordId: record.id,
    sequence: 0,
    segments: [{ label: presentation.label, content: presentation.content }],
    attachments: recordAttachments
    })
  })

  const rawRecordEntries = records.filter((record) => (
    !recordsWithFacts.has(record.id) && (attachmentsByRecord.get(record.id)?.length ?? 0) === 0
  )).map((record): TimelineEntry => ({
    id: `${record.id}-raw`,
    time: record.occurredAt,
    createdAt: record.createdAt,
    periodLabel: formatHealthTimePeriod(undefined, record.occurredAt),
    content: record.content,
    recordType: record.type,
    kind: record.type === 'medication' ? 'medication' : 'text',
    sourceRecordId: record.id,
    sequence: 0,
    segments: [{ label: '记录', content: record.content }],
    attachments: []
  }))

  return [...factEntries, ...attachmentOnlyEntries, ...rawRecordEntries].sort((left, right) => compareHealthChronologyDesc(
    { id: left.id, occurredAt: left.time, createdAt: left.createdAt ?? left.time },
    { id: right.id, occurredAt: right.time, createdAt: right.createdAt ?? right.time }
  ))
}

function factPeriodLabel(fact: HealthFact, fallbackTime: string) {
  const raw = fact.time.raw ?? undefined
  if (fact.time.precision === 'year' || fact.time.precision === 'month' || fact.time.precision === 'day') return undefined
  if (fact.time.precision === 'fuzzy') return raw
  return formatHealthTimePeriod(raw, fact.time.resolvedStart ?? fallbackTime)
}

function factRecordType(type: HealthFactType): HealthEventRecordApiDto['type'] {
  if (type === 'symptom') return 'symptom'
  if (type === 'medication') return 'medication'
  if (type === 'visit') return 'visit'
  if (type === 'examination') return 'examination'
  return 'note'
}

function factLabel(type: HealthFactType): NonNullable<TimelineEntry['segments']>[number]['label'] {
  if (type === 'symptom') return '症状'
  if (type === 'temperature') return '体温'
  if (type === 'medication') return '用药'
  if (type === 'visit') return '就诊'
  if (type === 'examination') return '检查'
  if (type === 'concern') return '担心'
  if (type === 'status_change') return '状态'
  return '记录'
}

function statusChangeContent(fact: HealthFact) {
  const target = fact.target?.trim() || '症状'
  const isGeneric = target === '当前症状' || target === '症状'
  if (fact.change === 'improved') {
    if (isGeneric) return '症状有所改善'
    if (/疼|痛/.test(target)) return `${target}有所缓解`
    return `${target}有所好转`
  }
  if (fact.change === 'worsened') return isGeneric ? '症状较之前加重' : `${target}加重`
  if (fact.change === 'persistent') return isGeneric ? '症状仍在持续' : `${target}持续`
  return fact.name
}

function factDisplayContent(fact: HealthFact) {
  return fact.type === 'status_change' ? statusChangeContent(fact) : fact.name
}

function factSegments(fact: HealthFact): NonNullable<TimelineEntry['segments']> {
  return [
    ...(fact.bodyPart ? [{ label: '部位' as const, content: fact.bodyPart }] : []),
    { label: factLabel(fact.type), content: factDisplayContent(fact) }
  ]
}

function adaptAttachment(attachment: EventAttachmentApiDto): EventAttachment {
  return {
    id: attachment.id,
    name: attachment.name,
    type: 'image',
    url: attachment.dataUrl,
    recordId: attachment.recordId,
    analysis: attachment.analysis
  }
}

function attachmentPresentation(attachment?: EventAttachment) {
  const analysis = attachment?.analysis
  if (!analysis || analysis.status !== 'completed') return { label: '记录' as const, content: '图片记录' }
  if (analysis.category === 'temperature') return { label: '体温' as const, content: analysis.summary }
  if (analysis.category === 'report') return { label: '检查' as const, content: analysis.summary }
  if (analysis.category === 'medication' || analysis.category === 'prescription') {
    return { label: '用药' as const, content: analysis.summary }
  }
  if (analysis.category === 'body_photo') return { label: '记录' as const, content: analysis.summary }
  return { label: '记录' as const, content: analysis.summary || '图片记录' }
}

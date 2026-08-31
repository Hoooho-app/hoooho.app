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
  HealthMeasurementMethod,
  HealthRecordOrganizationApiDto,
  HealthRecordSourceType,
  Member,
  MemberRelation,
  TimelineEntry
} from '../types'
import { formatAgeFromBirthday } from '../utils/formatAgeFromBirthday'
import { createClayAvatarConfig, serializeClayAvatar } from '../utils/clayAvatar'
import { formatHealthTimePeriod } from '../utils/formatHealthTimePeriod'
import { getExactTemperatureMeasurement } from '../utils/temperatureMeasurement'
import { compareHealthChronologyDesc } from './healthChronology'
import { createTimelineRecordDetails, createTimelineRecordSummary } from './timelineRecordPresentation'

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
  const avatarGender = member.gender === 'male' || member.gender === 'female' ? member.gender : null
  const canGenerateAvatar = Boolean(member.birthday && avatarGender)

  return {
    id: member.id,
    name: member.name,
    relation: relationLabels[member.relationship],
    birthday: member.birthday ?? undefined,
    gender: member.gender ?? '',
    avatar: member.avatar ?? (canGenerateAvatar
      ? serializeClayAvatar(createClayAvatarConfig(member.name, member.birthday!, avatarGender!, member.id))
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
      ...(eventDto.status === 'recovered' && eventDto.recoveredAt
        ? {
            recoveryInfo: {
              recoveredAt: eventDto.recoveredAt,
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
    .flatMap((item) => {
      const temperature = item.fact.temperature!
      const exactValue = getExactTemperatureMeasurement(temperature.min, temperature.max)
      if (exactValue === null) return []
      const time = factTime(item)
      return {
        time,
        value: exactValue,
        min: exactValue,
        max: exactValue,
        label: `${exactValue.toFixed(1)}℃`,
        periodLabel: factPeriodLabel(item.fact, time),
        measurementSite: item.fact.bodyPart ?? undefined
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
  const factGroups = new Map<string, FactContext[]>()
  for (const item of facts) {
    const sourceKey = item.organization.recordId || `organization:${item.organization.id}`
    factGroups.set(sourceKey, [...(factGroups.get(sourceKey) ?? []), item])
  }
  const recordsWithFacts = new Set([...factGroups.keys()].filter((key) => !key.startsWith('organization:')))

  const factEntries = [...factGroups.entries()].flatMap(([sourceKey, items]) => items.map((item, index): TimelineEntry => {
    const record = item.record
    const fact = item.fact
    const time = fact.time.precision === 'year'
      ? record?.occurredAt ?? item.organization.createdAt
      : factTime(item)
    const segments = uniqueSegments(factSegments(fact))
    const factSummary = segments.filter((segment) => segment.label !== '部位').map((segment) => segment.content).join('；')
    const originalText = record?.sourceText?.trim()
      || record?.content.trim()
      || item.organization.rawInput.trim()
      || factSummary
    const recordAttachments = record ? attachmentsByRecord.get(record.id) ?? [] : []
    const sourceType = timelineSourceType(record, [item], recordAttachments)
    return {
      id: `${sourceKey}-${fact.id}-timeline`,
      time,
      createdAt: record?.createdAt ?? item.organization.createdAt,
      displayTime: fact.time.raw ?? undefined,
      periodLabel: factPeriodLabel(fact, time),
      content: factSummary,
      summary: factSummary,
      details: createTimelineRecordDetails(originalText),
      recordType: record?.type ?? factRecordType(fact.type),
      kind: fact.type === 'temperature' ? 'temperature' : fact.type === 'medication' ? 'medication' : 'text',
      sourceRecordId: record?.id ?? (item.organization.recordId || undefined),
      source: timelineSource(sourceType, {
        originalText,
        measurementMethod: record?.measurementMethod ?? fact.measurementMethod ?? null,
        measurementDevice: record?.measurementDevice ?? fact.measurementDevice ?? null,
        fileName: recordAttachments[0]?.name ?? null,
        note: record?.note ?? null
      }),
      sequence: index,
      segments,
      attachments: recordAttachments
    }
  }))

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
    content: record.content,
    summary: createTimelineRecordSummary(record.content, presentation.content),
    details: createTimelineRecordDetails(record.content),
    recordType: 'note',
    kind: 'text',
    sourceRecordId: record.id,
    source: timelineSource('medical_file', {
      originalText: record.sourceText?.trim() || record.content,
      measurementMethod: record.measurementMethod,
      measurementDevice: record.measurementDevice,
      fileName: recordAttachments[0]?.name ?? null,
      note: record.note
    }),
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
    content: compactUnstructuredRecord(record.content),
    summary: compactUnstructuredRecord(record.content),
    details: createTimelineRecordDetails(record.content),
    recordType: record.type,
    kind: record.type === 'medication' ? 'medication' : 'text',
    sourceRecordId: record.id,
    source: timelineSource(record.sourceType ?? 'user_record', {
      originalText: record.sourceText?.trim() || record.content,
      measurementMethod: record.measurementMethod,
      measurementDevice: record.measurementDevice,
      fileName: null,
      note: record.note
    }),
    sequence: 0,
    segments: [{ label: '记录', content: compactUnstructuredRecord(record.content) }],
    attachments: []
  }))

  return [...factEntries, ...attachmentOnlyEntries, ...rawRecordEntries].sort((left, right) => compareHealthChronologyDesc(
    { id: left.id, occurredAt: left.time, createdAt: left.createdAt ?? left.time },
    { id: right.id, occurredAt: right.time, createdAt: right.createdAt ?? right.time }
  ))
}

function compactUnstructuredRecord(value: string) {
  const summary = createTimelineRecordSummary(value)
  const clause = summary.split(/[，,；;。！？!?]/u).find((item) => item.trim())?.trim() || '健康记录'
  return clause.length > 22 ? `${clause.slice(0, 22).trimEnd()}…` : clause
}

function timelineSourceType(
  record: HealthEventRecordApiDto | undefined,
  items: FactContext[],
  attachments: EventAttachment[]
): HealthRecordSourceType {
  if (record?.sourceType) return record.sourceType
  if (attachments.length || items.some((item) => item.fact.time.source === 'document')) return 'medical_file'
  if (items.some((item) => item.fact.source === 'doctor_statement')) return 'doctor_confirmation'
  if (items.some((item) => item.fact.type === 'temperature' || item.fact.source === 'measurement')) return 'measurement'
  return 'user_record'
}

function timelineSource(
  type: HealthRecordSourceType,
  details: {
    originalText: string
    measurementMethod?: HealthMeasurementMethod | null
    measurementDevice?: string | null
    fileName?: string | null
    note?: string | null
  }
): TimelineEntry['source'] {
  const labels: Record<HealthRecordSourceType, string> = {
    user_record: '用户记录',
    voice_record: '语音记录',
    text_record: '文字记录',
    measurement: '体温测量',
    medical_file: '医疗文件',
    doctor_confirmation: '医生确认',
    other: '其他来源'
  }
  return {
    type,
    label: labels[type],
    originalText: details.originalText,
    measurementMethod: details.measurementMethod ?? 'unspecified',
    measurementDevice: details.measurementDevice?.trim() || null,
    fileName: details.fileName?.trim() || null,
    note: details.note?.trim() || null
  }
}

function uniqueSegments(segments: NonNullable<TimelineEntry['segments']>) {
  const seen = new Set<string>()
  return segments.filter((segment) => {
    const key = `${segment.label}:${segment.content}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
  if (fact.change === 'unchanged') return isGeneric ? '症状未继续加重' : `${target}未加重`
  if (fact.change === 'resolved') return isGeneric ? '症状已消失' : `${target}已消失`
  return fact.name
}

function factDisplayContent(fact: HealthFact) {
  if (fact.type === 'status_change') return statusChangeContent(fact)
  const name = fact.polarity === 'negated' ? `未出现${fact.name}` : fact.name
  const attributes = [
    fact.severity === 'severe' ? '严重' : fact.severity === 'moderate' ? '中度' : fact.severity === 'mild' ? '轻微' : null,
    fact.severityScale,
    fact.frequency === 'occasional' ? '偶尔' : fact.frequency === 'frequent' ? '频繁' : fact.frequency === 'continuous' ? '持续' : null,
    fact.occurrenceCount ? `${fact.occurrenceCount}次` : null,
    fact.duration
  ].filter(Boolean)
  return [name, ...attributes].join(' · ')
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

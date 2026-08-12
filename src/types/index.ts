export type MemberRelation = '本人' | '配偶' | '母亲' | '父亲' | '子女' | '其他'

export interface Member {
  id: string
  name: string
  age: string
  relation: MemberRelation
  birthday?: string
  gender?: ProfileGender
  avatar?: string
  heightCm?: number
  weightKg?: number
  bloodType?: 'A' | 'B' | 'AB' | 'O'
}

export type ProfileGender = 'male' | 'female' | 'undisclosed' | ''

export interface UserProfile {
  nickname: string
  birthday: string
  gender: ProfileGender
  avatar?: string
}

export interface AuthUser {
  id: string
  phone: string
  createdAt: string
}

export interface AuthSession {
  token: string
  user: AuthUser
}

export type ApiMemberRelationship = 'self' | 'child' | 'parent' | 'spouse' | 'other'
export type ApiMemberGender = 'male' | 'female' | 'undisclosed' | null

export interface FamilyMemberApiDto {
  id: string
  accountId: string
  name: string
  relationship: ApiMemberRelationship
  gender: ApiMemberGender
  birthday: string | null
  avatar: string | null
  heightCm?: number | null
  weightKg?: number | null
  bloodType?: 'A' | 'B' | 'AB' | 'O' | null
  isSelf: boolean
  createdAt: string
  updatedAt: string
}

export type HealthEventCategory = 'fever' | 'cough' | 'pain' | 'injury' | 'allergy' | 'other'

export interface HealthEventApiDto {
  id: string
  accountId: string
  memberId: string
  title: string
  category: HealthEventCategory
  status: HealthEventStage
  startTime: string
  createdAt: string
  updatedAt: string
}

export interface CreateHealthEventInput {
  memberId: string
  title: string
  category: HealthEventCategory
  startTime: string
}

export interface HealthEventListItemViewModel {
  id: string
  memberId: string
  memberName: string
  title: string
  summary: string | null
  category: HealthEventCategory
  status: HealthEventStage
  startTime: string
  occurredAt: string
  createdAt: string
  updatedAt: string
}

export type HealthEventRecordType = 'note' | 'symptom' | 'medication' | 'visit' | 'examination' | 'other'

export interface HealthEventRecordApiDto {
  id: string
  accountId: string
  eventId: string
  type: HealthEventRecordType
  content: string
  occurredAt: string
  createdAt: string
  updatedAt: string
}

export interface CreateHealthEventRecordInput {
  type: HealthEventRecordType
  content: string
  occurredAt: string
  attachments?: CreateEventAttachmentInput[]
  bodyLocations?: string[]
}

export interface CreateEventAttachmentInput {
  name: string
  mimeType: string
  dataUrl: string
  recordId?: string
}

export interface EventAttachmentApiDto extends CreateEventAttachmentInput {
  id: string
  accountId: string
  eventId: string
  createdAt: string
}

export interface OrganizedHealthFact {
  content: string
  keywords: string[]
}

export interface OrganizedTemperature {
  min: number
  max: number
  unit: '℃'
}

export interface OrganizedTimelineItem {
  time: string
  content: string
  relatedSymptoms: string[]
}

export interface OrganizedHealthData {
  symptoms: OrganizedHealthFact[]
  temperature: OrganizedTemperature | null
  medications: OrganizedHealthFact[]
  visits: OrganizedHealthFact[]
  examinations: OrganizedHealthFact[]
  concerns: OrganizedHealthFact[]
  attachments: OrganizedHealthFact[]
  timeline: OrganizedTimelineItem[]
}

export type HealthFactType = 'symptom' | 'temperature' | 'medication' | 'visit' | 'examination' | 'concern' | 'status_change'
export type HealthStatusChange = 'improved' | 'worsened' | 'persistent'
export type HealthFactTimePrecision = 'exact' | 'period' | 'day' | 'month' | 'year' | 'fuzzy' | 'unknown'
export type HealthFactTimeSource = 'user_text' | 'selected_time' | 'document'

export interface HealthFact {
  id: string
  type: HealthFactType
  name: string
  bodyPart: string | null
  sourceText: string
  time: {
    raw: string | null
    resolvedStart: string | null
    resolvedEnd: string | null
    precision: HealthFactTimePrecision
    source: HealthFactTimeSource
  }
  confidence: number
  temperature?: OrganizedTemperature
  target?: string | null
  change?: HealthStatusChange | null
}

export interface HealthAIOutput {
  facts: HealthFact[]
  confidence: number
  parserVersion: string
  promptVersion: string
  timeConflict: {
    hasConflict: boolean
    conflict: {
      type: 'time_conflict'
      selected: string
      mentioned: string
    } | null
  }
}

export interface HealthRecordOrganizationApiDto {
  id: string
  accountId: string
  eventId: string
  recordId: string
  rawInput: string
  healthAIOutput: HealthAIOutput
  organizedHealthData: OrganizedHealthData
  confirmedData: OrganizedHealthData | null
  status: 'completed' | 'failed'
  provider: string
  createdAt: string
  updatedAt: string
}

export interface HealthRecordOrganizationPreviewApiDto {
  hasHealthFacts: boolean
  healthAIOutput: HealthAIOutput
  organizedHealthData: OrganizedHealthData
  provider: string
}

export interface NotificationPreferences {
  healthEvent: boolean
  medication: boolean
  followUp: boolean
  familyHealth: boolean
  system: boolean
  quietHours: string
}

export type HealthEventStatus = 'empty' | 'ongoing' | 'recovered'
export type HealthEventStage = 'observing' | 'handling' | 'recovered'

export interface TimelineEntry {
  id: string
  time: string
  createdAt?: string
  displayTime?: string
  periodLabel?: string
  content: string
  recordType: HealthEventRecordType
  kind: 'text' | 'temperature' | 'medication'
  sourceRecordId?: string
  sequence?: number
  segments?: Array<{
    label: '症状' | '体温' | '用药' | '检查' | '就诊' | '担心' | '状态' | '部位' | '附件' | '记录'
    content: string
  }>
  attachments?: EventAttachment[]
}

export interface HealthEventMedicalInfo {
  allergies: string[]
  medications: string[]
  medicalHistory: string[]
  chronicDiseases: string[]
  familyHistory: string[]
}

export interface HealthEventRecoveryInfo {
  recoveredAt: string
  result: string
  note: string
}

export interface TemperatureRecord {
  time: string
  value: number
  min?: number
  max?: number
  label?: string
  periodLabel?: string
}

export interface EventAttachment {
  id: string
  name: string
  type: 'image' | 'document'
  url?: string
  recordId?: string
}

export interface HealthEvent {
  id: string
  memberId: string
  title: string
  status: HealthEventStatus
  startDate: string
  symptoms: string[]
  summary: string
  medications: string[]
  visits: string[]
  examinations: string[]
  timeline: TimelineEntry[]
  temperatureRecords: TemperatureRecord[]
  attachments: EventAttachment[]
  concerns: string[]
  personalizedModules: Array<{
    id: string
    status: 'placeholder' | 'started' | 'completed'
    data?: Record<string, unknown>
  }>
  medicalInfo: HealthEventMedicalInfo
  recoveryInfo?: HealthEventRecoveryInfo
}

export interface HealthEventDetailViewModel {
  event: HealthEvent
  category: HealthEventCategory
  stage: HealthEventStage
  hasTimeConflict: boolean
}

export interface HealthProfile {
  memberId: string
  heightCm?: number
  weightKg?: number
  bloodType?: string
  mbti?: string
  allergies: string[]
  medications: string[]
  medicalHistory: string[]
  chronicDiseases: string[]
  familyHistory: string[]
}

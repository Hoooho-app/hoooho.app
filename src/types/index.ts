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
  waistCircumferenceCm?: number
  bodyFatPercentage?: number
  headCircumferenceCm?: number
  rhBloodType?: 'positive' | 'negative'
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
  email?: string
  phone?: string
  createdAt: string
}

export interface AuthSession {
  token: string
  user: AuthUser
}

export interface AccountEntryState {
  familyMemberCount: number
  hasValidHealthRecord: boolean
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
  waistCircumferenceCm?: number | null
  bodyFatPercentage?: number | null
  headCircumferenceCm?: number | null
  rhBloodType?: 'positive' | 'negative' | null
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
  eventSummary?: HealthEventSummaryApiDto | null
  createdAt: string
  updatedAt: string
}

export interface CreateHealthEventInput {
  memberId: string
  title: string
  category: HealthEventCategory
  startTime?: string
}

export interface HealthEventSummaryResult {
  title: string
  summary: string
  tags: HealthEventSummaryTag[]
  evidence: string[]
  updatedAt: string
  source?: 'system' | 'user_corrected'
}

export interface HealthEventSummaryTag {
  label: string
  kind: 'diagnosis' | 'assessment' | 'symptom' | 'measurement' | 'change'
  source: 'doctor_statement' | 'test_result' | 'ai_consultation' | 'user_report' | 'measurement'
  certainty: 'confirmed' | 'suspected' | null
  priority: number
  sourceRecordId?: string | null
  factUpdatedAt?: string | null
}

export interface HealthEventSummaryApiDto {
  aggregationVersion?: number
  systemGenerated: HealthEventSummaryResult
  userCorrection: { title: string; summary: string; updatedAt: string } | null
  displayedResult: HealthEventSummaryResult
  hasNewEvidenceAfterCorrection: boolean
}

export interface HealthEventListItemViewModel {
  id: string
  memberId: string
  memberName: string
  title: string
  definitionTitle: string
  quickFacts: string[]
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

export type OnlineConsultationStatus = 'preparing' | 'waiting' | 'doctor_questions' | 'completed'

export interface OnlineConsultationQuestionApiDto {
  id: string
  question: string
  reply: string
  missing: string[]
  sources: string[]
  supplements: string[]
  createdAt: string
}

export interface OnlineConsultationApiDto {
  id: string
  accountId: string
  eventId: string
  status: OnlineConsultationStatus
  questions: OnlineConsultationQuestionApiDto[]
  finalDoctorInstructions: string | null
  finalRecordId: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateEventAttachmentInput {
  name: string
  mimeType: string
  dataUrl: string
  recordId?: string
}

export type ImageAnalysisStatus = 'completed' | 'unavailable' | 'failed'
export type ImageAnalysisCategory = 'temperature' | 'report' | 'medication' | 'prescription' | 'receipt' | 'body_photo' | 'other'

export interface ImageAnalysisResult {
  status: ImageAnalysisStatus
  category: ImageAnalysisCategory
  summary: string
  observedText?: string
  medicationName?: string | null
  examinationName?: string | null
  temperatureValue?: number | null
  extractedFacts: HealthFact[]
  confidence?: number
  provider: string | null
  sourceAttachmentId?: string
  analyzedAt: string
  errorCode?: string
}

export interface EventAttachmentApiDto extends CreateEventAttachmentInput {
  id: string
  accountId: string
  eventId: string
  createdAt: string
  analysis?: ImageAnalysisResult
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

export type HealthFactType = 'symptom' | 'temperature' | 'medication' | 'visit' | 'examination' | 'diagnosis' | 'concern' | 'status_change' | 'other'
export type HealthStatusChange = 'improved' | 'worsened' | 'persistent' | 'recurred' | 'resolved'
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
  polarity?: 'affirmed' | 'negated' | 'uncertain'
  temporality?: 'current' | 'historical' | 'future' | 'conditional' | 'unknown'
  status?: 'active' | 'improving' | 'resolved' | 'recurrent' | 'planned' | 'not_applicable' | 'unknown'
  subject?: 'event_subject' | 'family_member' | 'other_person' | 'unknown'
  source?: 'user_report' | 'measurement' | 'doctor_statement' | 'test_result' | 'ai_consultation' | 'structured_input' | 'quoted_text' | 'internet_information' | 'unknown'
  diagnosisCertainty?: 'confirmed' | 'suspected' | 'ruled_out' | 'pending' | 'unknown'
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
  summary?: string
  details?: {
    description: string
    measures: string[]
  }
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
  measurementSite?: string
}

export interface EventAttachment {
  id: string
  name: string
  type: 'image' | 'document'
  url?: string
  recordId?: string
  analysis?: ImageAnalysisResult
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

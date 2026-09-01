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
  recoveredAt?: string | null
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
  kind: 'diagnosis' | 'assessment' | 'symptom' | 'measurement' | 'change' | 'medication' | 'visit' | 'examination'
  source: 'doctor_statement' | 'test_result' | 'ai_consultation' | 'user_report' | 'measurement'
  certainty: 'confirmed' | 'suspected' | null
  priority: number
  sourceRecordId?: string | null
  factUpdatedAt?: string | null
  occurredAt?: string | null
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
  displayTitle: string
  definitionTitle: string
  durationLabel: string | null
  summaryFragments: HealthEventCardSummaryFragment[]
  category: HealthEventCategory
  status: HealthEventStage
  startTime: string
  recoveredAt: string | null
  occurredAt: string
  createdAt: string
  updatedAt: string
}

export interface HealthEventCardSummaryFragment {
  label: string
  sourceRecordId: string | null
  kind: HealthEventSummaryTag['kind'] | 'legacy'
}

export type HealthEventRecordType = 'note' | 'symptom' | 'medication' | 'visit' | 'examination' | 'other'
export type HealthRecordSourceType = 'user_record' | 'voice_record' | 'text_record' | 'measurement' | 'medical_file' | 'doctor_confirmation' | 'other'
export type HealthInputIntent = 'health_fact' | 'correction_or_command' | 'irrelevant_or_chat' | 'uncertain_health_fact'
export type HealthMeasurementMethod = 'unspecified' | 'oral' | 'axillary' | 'ear' | 'forehead' | 'other'

export interface HealthEventRecordApiDto {
  id: string
  accountId: string
  eventId: string
  type: HealthEventRecordType
  content: string
  occurredAt: string
  sourceType?: HealthRecordSourceType
  sourceText?: string | null
  measurementMethod?: HealthMeasurementMethod | null
  measurementDevice?: string | null
  note?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateHealthEventRecordInput {
  type: HealthEventRecordType
  content: string
  occurredAt: string
  sourceType?: HealthRecordSourceType
  sourceText?: string | null
  measurementMethod?: HealthMeasurementMethod | null
  measurementDevice?: string | null
  note?: string | null
  attachments?: CreateEventAttachmentInput[]
  bodyLocations?: string[]
}

export type UpdateHealthEventRecordInput = Partial<Pick<HealthEventRecordApiDto,
  'type' | 'content' | 'occurredAt' | 'sourceType' | 'sourceText' | 'measurementMethod' | 'measurementDevice' | 'note'
>>

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
  confirmed?: boolean
}

export type ImageAnalysisStatus = 'completed' | 'needs_confirmation' | 'irrelevant' | 'unsafe' | 'unavailable' | 'failed'
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
  relevance?: 'health' | 'irrelevant' | 'unsafe' | 'uncertain'
}

export interface EventAttachmentPreviewApiDto {
  status: ImageAnalysisStatus
  analysis: ImageAnalysisResult
  contentHash: string
  width: number
  height: number
  canConfirm: boolean
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
export type HealthStatusChange = 'improved' | 'worsened' | 'persistent' | 'recurred' | 'resolved' | 'unchanged' | 'corrected'
export type HealthFactTimePrecision = 'exact' | 'period' | 'day' | 'month' | 'year' | 'fuzzy' | 'unknown'
export type HealthFactTimeSource = 'user_text' | 'selected_time' | 'document'

export interface HealthFact {
  id: string
  type: HealthFactType
  name: string
  bodyPart: string | null
  bodyRegion?: string | null
  laterality?: string | null
  severity?: string | null
  severityScale?: string | null
  frequency?: string | null
  occurrenceCount?: number | null
  duration?: string | null
  sourceText: string
  time: {
    raw: string | null
    resolvedStart: string | null
    resolvedEnd: string | null
    precision: HealthFactTimePrecision
    source: HealthFactTimeSource
  }
  confidence: number
  category?: string
  concept?: string
  originalText?: string
  sourceRecordId?: string | null
  organizationRevision?: number | null
  value?: number
  unit?: string
  count?: number
  requiresConfirmation?: boolean
  supersedesFactId?: string
  revisionOfFactId?: string | null
  polarity?: 'affirmed' | 'negated' | 'uncertain'
  temporality?: 'current' | 'historical' | 'future' | 'conditional' | 'unknown'
  status?: 'active' | 'persistent' | 'improving' | 'worsened' | 'resolved' | 'recurrent' | 'stable' | 'not_worsened' | 'corrected' | 'superseded' | 'planned' | 'not_applicable' | 'unknown'
  subject?: 'event_subject' | 'family_member' | 'other_person' | 'unknown'
  subjectMemberId?: string | null
  subjectKind?: string | null
  subjectText?: string | null
  assertionType?: string | null
  source?: 'user_report' | 'measurement' | 'doctor_statement' | 'test_result' | 'ai_consultation' | 'structured_input' | 'quoted_text' | 'internet_information' | 'unknown'
  diagnosisCertainty?: 'confirmed' | 'suspected' | 'ruled_out' | 'pending' | 'unknown'
  medicationAction?: 'taken' | 'prescribed' | 'planned' | 'stopped' | 'unknown'
  temperature?: OrganizedTemperature
  measurementMethod?: Exclude<HealthMeasurementMethod, 'unspecified'> | null
  measurementDevice?: string | null
  target?: string | null
  change?: HealthStatusChange | null
  targetFactId?: string | null
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
  inputChannel?: 'voice' | 'text' | null
  previewId?: string | null
  rawRecordOnly?: boolean
  structuredMode?: 'disabled' | 'enabled'
}

export type HealthProfileFactCategory = 'important' | 'allergy' | 'medication' | 'chronic' | 'surgery' | 'other'
export type HealthProfileFactStatus = 'pending' | 'confirmed' | 'removed'

export interface HealthProfileFactSourceApiDto {
  organizationId: string
  sourceFactId: string
  eventId: string
  eventTitle: string
  eventStartTime: string
  recordId: string
  recordOccurredAt: string
  originalText: string
}

export interface CandidateHealthFactApiDto {
  id: string
  memberId: string
  title: string
  description: string
  suggestedCategory: HealthProfileFactCategory
  firstObservedAt: string
  source: HealthProfileFactSourceApiDto
}

export interface HealthProfileFactApiDto {
  id: string
  accountId: string
  memberId: string
  category: HealthProfileFactCategory
  title: string
  description: string
  status: HealthProfileFactStatus
  sources: HealthProfileFactSourceApiDto[]
  firstObservedAt: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface HealthRecordOrganizationPreviewApiDto {
  hasHealthFacts: boolean
  intent: HealthInputIntent
  healthAIOutput: HealthAIOutput
  organizedHealthData: OrganizedHealthData
  provider: string
  previewId?: string
  eventId: string
  memberId: string
  memberName: string
  rawInput?: string
  inputChannel?: 'voice' | 'text'
  parserVersion?: string
  createdAt?: string
  expiresAt?: string
  checksum?: string
  rawRecordOnly?: boolean
  structuredMode?: 'disabled' | 'enabled'
}

export interface HealthRecordOrganizationConfirmApiDto {
  previewId: string
  record: HealthEventRecordApiDto
  organization: HealthRecordOrganizationApiDto
  idempotent: boolean
  rawRecordOnly?: boolean
  structuredMode?: 'disabled' | 'enabled'
}

export type HealthInformationCandidateCategory = 'adverse_reaction' | 'chronic_condition' | 'long_term_medication' | 'important_health_fact'
export type HealthInformationCandidateStatus = 'pending' | 'confirmed' | 'dismissed'
export type HealthProfileDestination = 'allergy_adverse_reaction' | 'chronic_condition' | 'long_term_medication' | 'important_health_fact'

export interface HealthInformationCandidateApiDto {
  id: string
  memberId: string
  sourceEventId: string
  sourceRecordIds: string[]
  sourceFactIds: string[]
  category: HealthInformationCandidateCategory
  title: string
  description: string
  status: HealthInformationCandidateStatus
  destinationProfileSection: HealthProfileDestination | null
  note: string | null
  relatedCandidateId: string | null
  firstDiscoveredAt: string
  createdAt: string
  updatedAt: string
  confirmedAt: string | null
  dismissedAt: string | null
  profileFactId: string | null
  sourceEvent: { id: string; title: string; category: string; startTime: string }
  sourceRecords: Array<{ id: string; occurredAt: string; sourceType: HealthRecordSourceType; content: string }>
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
  source: {
    type: HealthRecordSourceType
    label: string
    originalText: string
    measurementMethod: HealthMeasurementMethod
    measurementDevice: string | null
    fileName: string | null
    note: string | null
  }
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

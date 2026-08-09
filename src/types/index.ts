export type MemberRelation = '本人' | '配偶' | '母亲' | '父亲' | '子女' | '其他'

export interface Member {
  id: string
  name: string
  age: string
  relation: MemberRelation
  birthday?: string
  gender?: ProfileGender
  avatar?: string
}

export type ProfileGender = 'male' | 'female' | 'undisclosed' | ''

export interface UserProfile {
  nickname: string
  birthday: string
  gender: ProfileGender
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
  category: HealthEventCategory
  status: HealthEventStage
  startTime: string
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
  content: string
  recordType: HealthEventRecordType
  kind: 'text' | 'temperature' | 'medication'
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
}

export interface EventAttachment {
  id: string
  name: string
  type: 'image' | 'document'
}

export interface HealthEvent {
  id: string
  memberId: string
  title: string
  status: HealthEventStatus
  startDate: string
  symptoms: string[]
  summary: string
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

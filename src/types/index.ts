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

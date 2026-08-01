export type MemberRelation = '本人' | '母亲' | '父亲' | '子女'

export interface Member {
  id: string
  name: string
  age: string
  relation: MemberRelation
  avatar?: string
}

export type HealthEventStatus = 'ongoing' | 'recovered'

export interface TimelineEntry {
  id: string
  time: string
  content: string
  kind: 'text' | 'temperature' | 'medication'
}

export interface HealthEvent {
  id: string
  memberId: string
  title: string
  startedAt: string
  status: HealthEventStatus
  summary: string
  timeline: TimelineEntry[]
}

export interface HealthProfile {
  memberId: string
  heightCm?: number
  weightKg?: number
  bloodType?: string
  allergies: string[]
  medications: string[]
  medicalHistory: string[]
  familyHistory: string[]
}

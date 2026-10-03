import type { HealthEventApiDto } from '../../types'
export type MaterialIdentity = 'parent' | 'medical_consultation' | 'examination_report' | 'external_ai' | 'pending'
export type ObservationResult = 'improved' | 'unchanged' | 'worse' | 'not_observed'
export interface ObservationTask {
  id: string; item: string; startsOn: string; endsOn: string; timesPerDay: number; timezone: string
  status: 'active' | 'paused' | 'ended'; state: 'active' | 'paused' | 'ended' | 'expired' | 'scheduled'
  source: 'doctor_confirmed' | 'parent'; sourceReference: { recordId: string; quote: string; page: number } | null
  reminderEnabled: false; todayRecorded: number; todayNotObserved: number; todayTarget: number
}
export interface FollowedCase {
  event: HealthEventApiDto & { caseArchivedAt?: string | null }
  latest: { id: string; content: string; occurredAt: string; createdAt: string } | null
  observations: ObservationTask[]; changedAt: string
}
export interface CasesData { active: FollowedCase[]; archived: FollowedCase[]; timezone: string; today: string }

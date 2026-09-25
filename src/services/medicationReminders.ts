import type { MedicationReminderPlan } from '../features/nurse-station/state'
import { apiRequest } from './apiClient'

export interface MedicationReminderCompletion {
  id: string
  occurrenceId: string
  scheduledAt: string
  actualTakenAt: string
  completedAt: string
  undoneAt: string | null
  eventId: string
  recordId: string
}

export interface MedicationReminderOccurrence {
  id: string
  scheduledAt: string
  day: string
  dayIndex: number
  weekIndex: number
  slotIndex: number
  completed: boolean
  completion: MedicationReminderCompletion | null
}

export interface MedicationReminderDto {
  id: string
  accountId: string
  memberId: string
  clientId: string | null
  status: 'active' | 'archived'
  plan: MedicationReminderPlan
  completions: MedicationReminderCompletion[]
  occurrences: MedicationReminderOccurrence[]
  nextOccurrence: MedicationReminderOccurrence | null
  totalDays: number | null
  createdAt: string
  updatedAt: string
  archivedAt?: string
}

export const medicationReminderService = {
  list(memberId: string, token: string) {
    return apiRequest<MedicationReminderDto[]>(`/api/medication-reminders?memberId=${encodeURIComponent(memberId)}`, { token })
  },
  create(memberId: string, plan: MedicationReminderPlan, token: string, clientId?: string) {
    return apiRequest<MedicationReminderDto>('/api/medication-reminders', { method: 'POST', token, body: { memberId, plan, clientId } })
  },
  complete(id: string, occurrenceId: string, actorId: string, token: string) {
    return apiRequest<MedicationReminderDto & { idempotent: boolean }>(`/api/medication-reminders/${encodeURIComponent(id)}/complete`, { method: 'POST', token, body: { occurrenceId, actorId } })
  },
  undo(id: string, token: string) {
    return apiRequest<MedicationReminderDto>(`/api/medication-reminders/${encodeURIComponent(id)}/undo`, { method: 'POST', token })
  },
  archive(id: string, token: string) {
    return apiRequest<MedicationReminderDto>(`/api/medication-reminders/${encodeURIComponent(id)}/archive`, { method: 'POST', token })
  },
  delete(id: string, token: string) {
    return apiRequest<{ deleted: true; idempotent: boolean }>(`/api/medication-reminders/${encodeURIComponent(id)}`, { method: 'DELETE', token })
  }
}

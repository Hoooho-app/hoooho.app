import { apiRequest } from './apiClient'

export type RoutineConsent = 'unset' | 'declined' | 'enabled' | 'disabled'
export type RoutineItemKey = 'nightSleep' | 'breakfast' | 'lunch' | 'dinner'
export type RoutineTrackStatus = 'routine' | 'confirmed' | 'skipped'

export interface RoutineTrack {
  trackKey: string
  templateId: string
  day: string
  itemKey: RoutineItemKey
  title: string
  category: 'diet' | 'sleep'
  meal?: string
  time: string
  endTime?: string
  status: RoutineTrackStatus
  recordId?: string | null
  eventId?: string | null
}

export interface RoutineTemplate {
  id: string
  effectiveFrom: string
  enabled: boolean
  items: Array<{ key: RoutineItemKey; title: string; category: 'diet' | 'sleep'; meal?: string; time: string; endTime?: string }>
}

export interface RoutineDay {
  consent: RoutineConsent
  template: RoutineTemplate | null
  tracks: RoutineTrack[]
}

export interface RoutineTemplateInput {
  effectiveFrom: string
  enabled: boolean
  items: Partial<Record<RoutineItemKey, { enabled: boolean; time: string; endTime?: string }>>
}

const base = (memberId: string) => `/api/routines/${encodeURIComponent(memberId)}`

export const routineTrackService = {
  getDay(memberId: string, day: string, token: string, signal?: AbortSignal) {
    return apiRequest<RoutineDay>(`${base(memberId)}?day=${encodeURIComponent(day)}`, { token, signal })
  },
  saveTemplate(memberId: string, input: RoutineTemplateInput, token: string) {
    return apiRequest<RoutineTemplate>(base(memberId), { method: 'PATCH', body: input, token })
  },
  setConsent(memberId: string, status: 'declined' | 'disabled', token: string) {
    return apiRequest<{ status: RoutineConsent }>(base(memberId), { method: 'PATCH', body: { status }, token })
  },
  act(memberId: string, itemKey: RoutineItemKey, input: Record<string, unknown> & { day: string; action: 'confirm' | 'skipped' | 'reset' }, token: string) {
    return apiRequest<RoutineTrack & { eventId?: string }>(`${base(memberId)}/tracks/${encodeURIComponent(itemKey)}`, { method: 'POST', body: input, token })
  }
}

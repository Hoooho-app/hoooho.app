import { apiRequest } from './apiClient'
import type { JournalMetadata } from '../types/journal'
export type DailyKind = 'feeding' | 'complementary' | 'meal' | 'snack' | 'supplement' | 'sleep' | 'bowel' | 'topical' | 'medication'
export type DailyFields = Record<string, string | number | boolean>
export interface DailySlot { id: string; name: string; time: string; enabled: boolean; fields: DailyFields }
export interface DailySettingsInput { kind: DailyKind; revision: number; enabled: boolean; timeZone: string; slots: DailySlot[] }
export interface DailyRule extends DailySettingsInput { id: string; effectiveFrom: string; effectiveAt: string }
export interface DailyExtras { dailySettings?: DailySettingsInput; automaticInstanceId?: string }
export interface DailyInstance { id: string; ruleId: string; slotId: string; revision: number; day: string; name: string; kind: DailyKind; plannedAt: string; generatedAt: string; timeZone: string; fields: DailyFields; journal: JournalMetadata; status: 'unconfirmed' | 'confirming' | 'confirmed' | 'skipped'; recordId?: string; eventId?: string }
const base = (memberId: string) => `/api/routines/${encodeURIComponent(memberId)}/daily`
export const dailyRecords = {
  source: (memberId: string, recordId: string, token: string, signal?: AbortSignal) => apiRequest<DailyInstance | null>(`${base(memberId)}/source/${encodeURIComponent(recordId)}`, { token, signal }),
  settings: (memberId: string, token: string, signal?: AbortSignal) => apiRequest<DailyRule[]>(base(memberId), { token, signal }),
  save: (memberId: string, input: DailySettingsInput, token: string) => apiRequest<DailyRule>(base(memberId), { token, method: 'PATCH', body: input }),
  instances: (memberId: string, day: string, token: string, signal?: AbortSignal) => apiRequest<DailyInstance[]>(`${base(memberId)}/instances?day=${encodeURIComponent(day)}`, { token, signal }),
  act: (memberId: string, id: string, input: { action: 'confirm' | 'skip'; occurredAt?: string; fields?: DailyFields; sleepStatus?: 'ongoing' | 'completed'; wakeAt?: string }, token: string) => apiRequest<DailyInstance>(`${base(memberId)}/instances/${id}`, { token, method: 'POST', body: input })
}

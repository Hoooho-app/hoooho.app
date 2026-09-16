import type { BodyLocationSelection } from '../../features/body-location'
import type { ContinuousRecordKind, ContinuousTimePrecision } from '../../types/journal'

export interface ManualContinuousDraft {
  narrative: string
  kind: ContinuousRecordKind
  precision: ContinuousTimePrecision
  timeExpression: string
  timeReferenceAt: string
  locations: BodyLocationSelection[]
  relatedRecordIds: string[]
  optionalOpen: boolean
  operationId: string
}

export const freshManualContinuousDraft = (): ManualContinuousDraft => ({
  narrative: '', kind: 'description', precision: 'unknown', timeExpression: '',
  timeReferenceAt: new Date().toISOString(), locations: [], relatedRecordIds: [], optionalOpen: false,
  operationId: crypto.randomUUID().replaceAll('-', '')
})

export function manualContinuousDraftKey(memberId: string, eventId: string | undefined, mode: string, recordId?: string) {
  return `hoooho:manual-continuous:${memberId}:${eventId ?? 'new'}:${mode}:${recordId ?? 'none'}`
}

export function loadManualContinuousDraft(key: string, fallback: ManualContinuousDraft) {
  try { return { ...fallback, ...(JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<ManualContinuousDraft>) } } catch { return fallback }
}

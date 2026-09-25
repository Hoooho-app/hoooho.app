import { apiRequest } from './apiClient'
import type {
  VisitChapterId,
  VisitFocus,
  VisitSheetState,
} from '../types/visitSheet'
export interface VisitSheetUpdate {
  expectedVersion: number
  requestId: string
  focus?: VisitFocus
  question?: string
  notes?: Partial<Record<VisitChapterId, string>>
}
export const visitSheetService = {
  get(memberId: string, token: string, signal?: AbortSignal) {
    return apiRequest<VisitSheetState & { expectedVersion?: number }>(
      `/api/members/${encodeURIComponent(memberId)}/visit-sheet`,
      {
        token,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
          : AbortSignal.timeout(20000),
      },
    )
  },
  save(
    memberId: string,
    token: string,
    body: VisitSheetUpdate,
    signal?: AbortSignal,
  ) {
    return apiRequest<VisitSheetState>(
      `/api/members/${encodeURIComponent(memberId)}/visit-sheet`,
      {
        token,
        method: 'PUT',
        body,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
          : AbortSignal.timeout(30000),
      },
    )
  },
}

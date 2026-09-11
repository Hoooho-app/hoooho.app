import { apiRequest } from './apiClient'
import type { GrowthMeasurementApiDto, GrowthMeasurementStatus, GrowthMeasurementType } from '../types'

export interface SaveGrowthMeasurementInput {
  memberId: string
  measuredAt: string
  measurementType: GrowthMeasurementType
  heightCm: number | null
  weightKg: number | null
  dataStatus?: GrowthMeasurementStatus
  standardId?: 'who-2006'
}

export const growthMeasurementService = {
  list(memberId: string, token: string, signal?: AbortSignal) {
    return apiRequest<GrowthMeasurementApiDto[]>(`/api/growth-measurements?memberId=${encodeURIComponent(memberId)}`, { token, signal })
  },
  upsert(input: SaveGrowthMeasurementInput, token: string, signal?: AbortSignal) {
    return apiRequest<GrowthMeasurementApiDto>('/api/growth-measurements', { token, signal, method: 'POST', body: input })
  },
  update(id: string, input: Partial<SaveGrowthMeasurementInput>, token: string) {
    return apiRequest<GrowthMeasurementApiDto>(`/api/growth-measurements/${encodeURIComponent(id)}`, { token, method: 'PATCH', body: input })
  },
  delete(id: string, token: string) {
    return apiRequest<{ success: true }>(`/api/growth-measurements/${encodeURIComponent(id)}`, { token, method: 'DELETE' })
  }
}

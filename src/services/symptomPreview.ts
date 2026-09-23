import { apiRequest } from './apiClient'

export interface SymptomPreviewResult {
  status: 'success' | 'empty'
  summary: string
  keywords: string[]
  bodyLocation: string
  provider: string
}

export const symptomPreviewService = {
  preview(memberId: string, input: { rawInput: string; selectedOccurredAt?: string; timezone?: string }, token: string, signal?: AbortSignal) {
    return apiRequest<SymptomPreviewResult>(`/api/members/${encodeURIComponent(memberId)}/symptom-preview`, {
      token,
      signal,
      method: 'POST',
      body: input
    })
  }
}

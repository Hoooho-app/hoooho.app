import { apiRequest } from './apiClient'

export interface QuickRecordCreateInput {
  memberId: string
  content: string
  occurredAt: string
  inputChannel: 'voice' | 'text'
  idempotencyKey: string
  title: string
}

export interface QuickRecordCreateResult {
  eventId: string
  recordId: string
  idempotent: boolean
}

export const quickRecordService = {
  create(input: QuickRecordCreateInput, token: string) {
    return apiRequest<QuickRecordCreateResult>('/api/quick-records', { method: 'POST', body: input, token })
  }
}

import type { AccountEntryState } from '../types'
import { apiRequest } from './apiClient'

export const accountEntryStateService = {
  get(token: string, signal?: AbortSignal) {
    return apiRequest<AccountEntryState>('/api/account/entry-state', { token, signal })
  }
}

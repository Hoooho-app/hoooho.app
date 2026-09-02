import type { AuthSession } from '../types'
import { useAppStore } from '../store/useAppStore'
import { apiRequest, ApiRequestError } from './apiClient'

export interface OpsSession {
  authenticated: true
  authorized: true
  email: string
}

export function clearOpsSessionForError(error: unknown) {
  if (!(error instanceof ApiRequestError)) return false
  if (error.status === 401) useAppStore.getState().clearOpsAuthSession('expired')
  else if (error.status === 403) useAppStore.getState().clearOpsAuthSession('forbidden')
  else if (error.status === 503 && error.code === 'OPS_OWNER_NOT_CONFIGURED') useAppStore.getState().clearOpsAuthSession('not-configured')
  else return false
  return true
}

export async function opsApiRequest<T>(path: string, options: { token: string; method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal }) {
  try {
    return await apiRequest<T>(path, options)
  } catch (error) {
    clearOpsSessionForError(error)
    throw error
  }
}

export const getOpsSession = (token: string, signal?: AbortSignal) => opsApiRequest<OpsSession>('/api/ops/session', { token, signal })
export const toOpsAuthSession = (token: string, session: OpsSession): AuthSession => ({
  token,
  user: { id: 'ops-owner', email: session.email, createdAt: '' }
})

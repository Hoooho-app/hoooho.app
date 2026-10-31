import { ApiRequestError } from './apiClient'
import { clearOpsSessionForError, opsApiRequest } from './opsAuth'

export type BillingMethod = 'api' | 'automatic-screenshot' | 'manual-screenshot'
export type BillingFrequency = 'daily' | 'weekly' | 'manual'
export type BillingStatus = 'success' | 'updating' | 'relogin' | 'manual' | 'failed' | 'unconfigured'

export interface BillingHealth {
  level: 'critical' | 'warning' | 'notice' | 'unknown' | 'normal' | 'paused'
  label: string; reasons: { code: string; level: string; label: string }[]; missing: string[]
  facts: { dueAt: string | null; dueKind: string | null; balance: number | null; currency: string | null; quotaRemaining: number | null; quotaLimit: number | null; quotaUnit: string | null; plan: string | null; autoRenew: boolean | null }
  observedAt: string | null; fresh: boolean; daysLeft: number | null; remainingPercent: number | null; verification: string; fingerprint: string
}
export interface BillingConnection { state: string; label: string; detail: string }

export interface BillingSnapshot {
  id: string
  sourceId: string
  result: 'success' | 'failed'
  method: BillingMethod
  createdAt: string
  capturedAt: string | null
  fileName: string | null
  mimeType: string | null
  size: number
  important: boolean
  failureReason: string | null
}

export interface BillingSource {
  health?: BillingHealth
  connection?: BillingConnection
  nextRunAt?: string | null
  lastVerifiedAt?: string | null
  projectId?: string
  id: string
  name: string
  icon: string
  platformUrl: string
  method: BillingMethod
  frequency: BillingFrequency
  notes: string
  status: BillingStatus
  enabled: boolean
  loginUrl: string | null
  targetDescription: string | null
  targetSelector: string | null
  waitCondition: string | null
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastFailureReason: string | null
  latestSnapshotId: string | null
  latestSnapshot: BillingSnapshot | null
  createdAt: string
  updatedAt: string
}

export interface BillingOverview {
  total: number
  updatedToday: number
  relogin: number
  failed: number
}

export interface BillingSourcesResponse {
  sources: BillingSource[]
  inactiveSources: string[]
  summary: BillingOverview
}

export interface BillingSourceInput {
  projectId?: string
  name: string
  icon: string
  platformUrl: string
  method: BillingMethod
  frequency: BillingFrequency
  notes: string
  loginUrl?: string | null
  targetDescription?: string | null
  targetSelector?: string | null
  waitCondition?: string | null
  enabled?: boolean
}

export const getBillingSources = (token: string, signal?: AbortSignal) => opsApiRequest<BillingSourcesResponse>('/api/ops/sources', { token, signal })
export const createBillingSource = (token: string, body: BillingSourceInput) => opsApiRequest<BillingSource>('/api/ops/sources', { token, method: 'POST', body })
export const updateBillingSource = (token: string, id: string, body: Partial<BillingSourceInput>) => opsApiRequest<BillingSource>(`/api/ops/sources/${encodeURIComponent(id)}`, { token, method: 'PATCH', body })
export const refreshBillingSource = (token: string, id: string) => opsApiRequest<BillingSource>(`/api/ops/sources/${encodeURIComponent(id)}/refresh`, { token, method: 'POST' })
export const refreshAllBillingSources = (token: string, project = 'all') => opsApiRequest<BillingSourcesResponse>(`/api/ops/refresh${project === 'all' ? '' : `?project=${encodeURIComponent(project)}`}`, { token, method: 'POST' })
export const getBillingHistory = (token: string, id: string) => opsApiRequest<{ snapshots: BillingSnapshot[] }>(`/api/ops/sources/${encodeURIComponent(id)}/snapshots`, { token })
export const uploadBillingSnapshot = (token: string, id: string, body: { name: string; type: string; dataUrl: string; privacyConfirmed: true }) => opsApiRequest<BillingSource>(`/api/ops/sources/${encodeURIComponent(id)}/snapshots`, { token, method: 'POST', body })
export const updateBillingSnapshot = (token: string, sourceId: string, snapshotId: string, important: boolean) => opsApiRequest<BillingSnapshot>(`/api/ops/sources/${encodeURIComponent(sourceId)}/snapshots/${encodeURIComponent(snapshotId)}`, { token, method: 'PATCH', body: { important } })

export async function getBillingSnapshotImage(token: string, sourceId: string, snapshotId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/ops/sources/${encodeURIComponent(sourceId)}/snapshots/${encodeURIComponent(snapshotId)}/image`, { headers: { Authorization: `Bearer ${token}` }, signal })
  if (!response.ok) {
    const error = new ApiRequestError(response.status === 404 ? '快照图片不存在' : '快照图片加载失败', response.status)
    clearOpsSessionForError(error)
    throw error
  }
  return response.blob()
}

import { apiRequest } from './apiClient'

export interface AIUsage {
  state: 'available' | 'unavailable'; since: string | null; periodStart: string
  calls?: number; failed?: number; unknown?: number; inputTokens?: number; outputTokens?: number; incomplete?: boolean
  audioSeconds?: number; audioReceipts?: number
  rows: { provider: string; model: string; calls: number; failed: number; unknown: number; inputTokens: number; outputTokens: number; audioSeconds: number; audioReceipts: number }[]
}
export interface AccountUsage {
  storage: { bytes: number; recordBytes: number; fileBytes: number; items: number; state: 'estimated' | 'partial'; checkedAt: string }
  ai: AIUsage
  subscription: { state: 'not_enabled'; storageLimitBytes: null }
  scope: string
}
export const getAccountUsage = (token: string, signal: AbortSignal) => apiRequest<AccountUsage>('/api/account/usage', { token, signal })
export function usageBytes(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '未读取'
  if (value === 0) return '0 B'
  const unit = value >= 1024 ** 3 ? 1024 ** 3 : value >= 1024 ** 2 ? 1024 ** 2 : value >= 1024 ? 1024 : 1
  return `${(value / unit).toLocaleString('zh-CN', { maximumFractionDigits: 1 })} ${{ 1: 'B', 1024: 'KB', 1048576: 'MB', 1073741824: 'GB' }[unit]}`
}
export const usageNumber = (value?: number) => value === undefined ? '未读取' : value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
export const usageTime = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '未读取'

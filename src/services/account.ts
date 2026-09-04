import type { AccountProfile, AccountProvider } from '../types'
import { apiRequest } from './apiClient'

export const maskEmail = (email: string | null) => {
  if (!email) return '未设置'
  const [local, domain] = email.split('@')
  return `${local.slice(0, Math.min(3, local.length))}•••@${domain}`
}
export const maskPhone = (phone: string | null) => phone ? `+86 ${phone.slice(0, 3)}••••${phone.slice(-4)}` : '未设置'

export const accountService = {
  get: (token: string) => apiRequest<AccountProfile>('/api/account/profile', { token }),
  update: (token: string, changes: Partial<Pick<AccountProfile, 'nickname' | 'avatar'>>) => apiRequest<AccountProfile>('/api/account/profile', { token, method: 'PATCH', body: changes }),
  sendCode: (token: string, kind: 'phone' | 'email', value: string) => apiRequest<{ success: true; expiresIn: number; retryAfter: number }>('/api/account/bind/send-code', { token, method: 'POST', body: { kind, value } }),
  verifyCurrent: (token: string, kind: 'phone' | 'email', code: string) => apiRequest<{ changeToken: string }>('/api/account/bind/verify-current', { token, method: 'POST', body: { kind, code } }),
  bind: (token: string, kind: 'phone' | 'email', value: string, code: string, challengeToken = '') => apiRequest<AccountProfile>('/api/account/bind/confirm', { token, method: 'POST', body: { kind, value, code, challengeToken } }),
  provider: (token: string, provider: AccountProvider, action: 'bind' | 'unbind') => apiRequest<AccountProfile>('/api/account/provider', { token, method: 'POST', body: { provider, action } }),
  sendDeleteCode: (token: string, kind: 'phone' | 'email') => apiRequest<{ success: true; expiresIn: number; retryAfter: number }>('/api/account/delete/send-code', { token, method: 'POST', body: { kind } }),
  verifyDelete: (token: string, kind: 'phone' | 'email', code: string) => apiRequest<{ deleteToken: string }>('/api/account/delete/verify', { token, method: 'POST', body: { kind, code } }),
  delete: (token: string, deleteToken: string) => apiRequest<{ deleted: true; idempotent: boolean }>('/api/account/delete', { token, method: 'POST', body: { deleteToken } })
}

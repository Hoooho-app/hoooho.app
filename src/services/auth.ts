import type { AuthSession } from '../types'

interface SendCodeResponse {
  success: true
  expiresIn: number
  retryAfter: number
}

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    retryAfter?: number
  }
}

export class AuthApiError extends Error {
  code: string
  retryAfter?: number
  status?: number
  requestId?: string

  constructor(message: string, code = 'AUTH_REQUEST_FAILED', retryAfter?: number, status?: number, requestId?: string) {
    super(message)
    this.name = 'AuthApiError'
    this.code = code
    this.retryAfter = retryAfter
    this.status = status
    this.requestId = requestId
  }
}

const createRequestId = () => globalThis.crypto?.randomUUID?.()
  ?? `web-${Date.now()}-${Math.random().toString(36).slice(2)}`

function publicErrorMessage(path: string, response: Response, data: ApiErrorBody | null) {
  const code = data?.error?.code
  const retryAfter = data?.error?.retryAfter
  if (code === 'INVALID_EMAIL') return data?.error?.message ?? '邮箱格式不正确'
  if (code === 'CODE_RATE_LIMITED') {
    return retryAfter ? `验证码已发送，请 ${retryAfter} 秒后再试` : '请求过于频繁，请稍后重试'
  }
  if (response.status === 429) return '请求过于频繁，请稍后重试'
  if (response.status === 403 && !data) return '请求被浏览器或网络安全策略拦截，请使用系统浏览器重试'
  if (path.includes('/email/') && (response.status >= 500 || code?.startsWith('EMAIL_PROVIDER_'))) {
    return '邮件服务暂时不可用，请稍后重试'
  }
  if (!data) return '服务器响应异常，请稍后重试'
  return data.error?.message ?? '请求失败，请稍后重试'
}

export async function postAuthRequest<T>(path: string, body: Record<string, string>, method: 'GET' | 'POST' = 'POST', legacyToken = ''): Promise<T> {
  const requestId = createRequestId()
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(path, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Hoooho-Request-ID': requestId,
        ...(legacyToken ? { Authorization: `Bearer ${legacyToken}` } : {})
      },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal
    })
    const responseRequestId = response.headers.get('X-Hoooho-Request-ID') ?? requestId
    const contentType = response.headers.get('Content-Type') ?? ''
    const responseText = await response.text()
    let data: (T & ApiErrorBody) | null = null
    if (contentType.includes('application/json') && responseText) {
      try {
        data = JSON.parse(responseText) as T & ApiErrorBody
      } catch {
        data = null
      }
    }

    if (!response.ok || !data) {
      const errorBody = data as ApiErrorBody | null
      throw new AuthApiError(
        publicErrorMessage(path, response, errorBody),
        errorBody?.error?.code ?? (response.ok ? 'INVALID_SERVER_RESPONSE' : `HTTP_${response.status}`),
        errorBody?.error?.retryAfter,
        response.status,
        responseRequestId
      )
    }
    return data
  } catch (error) {
    if (error instanceof AuthApiError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AuthApiError('请求超时，请稍后重试', 'AUTH_REQUEST_TIMEOUT', undefined, undefined, requestId)
    }
    throw new AuthApiError('网络连接异常，请检查网络后重试', 'AUTH_NETWORK_ERROR', undefined, undefined, requestId)
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export const authService = {
  guest: (guestToken = '') => postAuthRequest<AuthSession>('/api/auth/guest', { guestToken }),
  restore: (legacyToken = '') => postAuthRequest<AuthSession | { unauthenticated: true }>('/api/auth/session', {}, 'GET', legacyToken),
  logout: () => postAuthRequest<{ success: true }>('/api/auth/logout', {}),
  sendCode: (phone: string) => postAuthRequest<SendCodeResponse>('/api/auth/send-code', { phone }),
  login: (phone: string, code: string, guestToken = '') => postAuthRequest<AuthSession>('/api/auth/login', { phone, code, guestToken }),
  sendEmailCode: (email: string) => postAuthRequest<SendCodeResponse>('/api/auth/email/send-code', { email }),
  loginWithEmail: (email: string, code: string, guestToken = '') => postAuthRequest<AuthSession>('/api/auth/email/login', { email, code, guestToken }),
  sendOpsEmailCode: (email: string) => postAuthRequest<SendCodeResponse>('/api/ops/auth/email/send', { email }),
  loginOpsWithEmail: (email: string, code: string) => postAuthRequest<AuthSession>('/api/ops/auth/email/verify', { email, code })
}

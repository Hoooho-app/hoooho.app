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

  constructor(message: string, code = 'AUTH_REQUEST_FAILED', retryAfter?: number) {
    super(message)
    this.code = code
    this.retryAfter = retryAfter
  }
}

async function post<T>(path: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await response.json() as T & ApiErrorBody
  if (!response.ok) {
    throw new AuthApiError(data.error?.message ?? '请求失败，请稍后重试', data.error?.code, data.error?.retryAfter)
  }
  return data
}

export const authService = {
  sendCode: (phone: string) => post<SendCodeResponse>('/api/auth/send-code', { phone }),
  login: (phone: string, code: string) => post<AuthSession>('/api/auth/login', { phone, code }),
  sendEmailCode: (email: string) => post<SendCodeResponse>('/api/auth/email/send-code', { email }),
  loginWithEmail: (email: string, code: string) => post<AuthSession>('/api/auth/email/login', { email, code })
}

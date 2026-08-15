import type { AuthSession } from '../types'
import { FetchTimeoutError, reliableFetch } from './apiClient'

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
  let response: Response
  try {
    response = await reliableFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      retries: 0
    })
  } catch (error) {
    if (error instanceof FetchTimeoutError) throw new AuthApiError(error.message, 'REQUEST_TIMEOUT')
    throw error
  }
  const data = await response.json() as T & ApiErrorBody
  if (!response.ok) {
    throw new AuthApiError(data.error?.message ?? '请求失败，请稍后重试', data.error?.code, data.error?.retryAfter)
  }
  return data
}

export const authService = {
  sendCode: (phone: string) => post<SendCodeResponse>('/api/auth/send-code', { phone }),
  login: (phone: string, code: string) => post<AuthSession>('/api/auth/login', { phone, code })
}

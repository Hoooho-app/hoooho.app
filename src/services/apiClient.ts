import { recoverSessionToken } from './sessionRecoveryCoordinator'

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
  }
}

export class ApiRequestError extends Error {
  code: string
  status: number

  constructor(message: string, status: number, code = 'API_REQUEST_FAILED') {
    super(message)
    this.code = code
    this.status = status
  }
}

interface ApiRequestOptions {
  token: string
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

async function executeApiRequest<T>(path: string, options: ApiRequestOptions, mayRecover: boolean): Promise<T> {
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${options.token}`,
      ...(browserTimeZone ? { 'X-Hoooho-Timezone': browserTimeZone } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    signal: options.signal,
    credentials: 'same-origin'
  })

  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      throw new ApiRequestError('服务器返回了无法识别的数据', response.status, 'INVALID_API_RESPONSE')
    }
  }

  if (!response.ok) {
    const errorBody = data as ApiErrorBody | null
    if (response.status === 401 && mayRecover) {
      try {
        const token = await recoverSessionToken()
        if (token) return executeApiRequest<T>(path, { ...options, token }, false)
      } catch {
        throw new ApiRequestError('暂时无法恢复使用状态，请检查网络后重试', 503, 'SESSION_RECOVERY_FAILED')
      }
    }
    throw new ApiRequestError(
      errorBody?.error?.message ?? '请求失败，请稍后重试',
      response.status,
      errorBody?.error?.code
    )
  }

  return data as T
}

export function apiRequest<T>(path: string, options: ApiRequestOptions): Promise<T> {
  return executeApiRequest<T>(path, options, true)
}

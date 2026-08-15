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

export class FetchTimeoutError extends Error {
  constructor() {
    super('请求超时，请检查网络后重试')
    this.name = 'FetchTimeoutError'
  }
}

interface ReliableFetchOptions extends RequestInit {
  timeoutMs?: number
  retries?: number
}

export async function reliableFetch(input: RequestInfo | URL, options: ReliableFetchOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 10_000
  const retries = options.retries ?? ((options.method ?? 'GET') === 'GET' ? 1 : 0)
  const startedAt = Date.now()

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const remainingMs = timeoutMs - (Date.now() - startedAt)
    if (remainingMs <= 0) throw new FetchTimeoutError()

    const attemptsRemaining = retries - attempt + 1
    const attemptTimeoutMs = Math.max(1, Math.floor(remainingMs / attemptsRemaining))
    const controller = new AbortController()
    let timedOut = false
    const abortFromCaller = () => controller.abort()
    options.signal?.addEventListener('abort', abortFromCaller, { once: true })
    const timer = globalThis.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, attemptTimeoutMs)

    try {
      const response = await fetch(input, { ...options, signal: controller.signal })
      if (response.status >= 500 && attempt < retries) {
        void response.body?.cancel()
        continue
      }
      const body = [204, 205, 304].includes(response.status) ? null : await response.arrayBuffer()
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      })
    } catch (error) {
      if (options.signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError')
      if (!timedOut && attempt >= retries) throw error
      if (attempt >= retries || Date.now() - startedAt >= timeoutMs) throw new FetchTimeoutError()
    } finally {
      globalThis.clearTimeout(timer)
      options.signal?.removeEventListener('abort', abortFromCaller)
    }
  }

  throw new FetchTimeoutError()
}

interface ApiRequestOptions {
  token: string
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  timeoutMs?: number
  retries?: number
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions): Promise<T> {
  let response: Response
  try {
    response = await reliableFetch(path, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${options.token}`,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      retries: options.retries
    })
  } catch (error) {
    if (error instanceof FetchTimeoutError) {
      throw new ApiRequestError(error.message, 408, 'REQUEST_TIMEOUT')
    }
    throw error
  }

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
    throw new ApiRequestError(
      errorBody?.error?.message ?? '请求失败，请稍后重试',
      response.status,
      errorBody?.error?.code
    )
  }

  return data as T
}

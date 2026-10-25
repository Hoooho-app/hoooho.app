import { abortable } from './abortable'
import {trackSavedMutation} from '../features/record-updates/store'
import { recoverSessionToken } from './sessionRecoveryCoordinator'
import { useBrowserRecoveryState } from './browserRecoveryState'
import type { AIUnverifiedPreview } from '../features/ai-business/AIResultPreview'

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    preview?: AIUnverifiedPreview
  }
}

export class ApiRequestError extends Error {
  code: string
  status: number
  preview?: AIUnverifiedPreview

  constructor(message: string, status: number, code = 'API_REQUEST_FAILED') {
    super(message)
    this.code = code
    this.status = status
  }
}

interface ApiRequestOptions {
  token?: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

async function executeApiRequest<T>(path: string, options: ApiRequestOptions, mayRecover: boolean): Promise<T> {
  options={...options,headers:{'X-Hoooho-Trace-Id':crypto.randomUUID(),...options.headers}}
  const changesData = Boolean(options.method && options.method !== 'GET' && !/^\/api\/ai\/audio\/live(?:\/|$)/.test(path) && !(options.method === 'POST' && ['/api/ai/audio/transcriptions','/api/ai/telemetry'].includes(path.split('?')[0])))
  options.signal?.throwIfAborted()
  const mutationScope=changesData?await import('../store/useAppStore').then(({useAppStore})=>{const s=useAppStore.getState();return {accountId:s.authUser?.id??'',memberId:s.currentMemberId}}):undefined
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
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
    const credentialRejected = ['CODE_INCORRECT', 'CODE_ATTEMPTS_EXCEEDED', 'INVALID_CURRENT_PASSWORD', 'INVALID_CREDENTIALS'].includes(errorBody?.error?.code ?? '')
    const sessionUnauthorized = response.status === 401 && !credentialRejected
    if (sessionUnauthorized && !mayRecover && useBrowserRecoveryState.getState().contextAccountId) {
      useBrowserRecoveryState.setState({ reauthenticationRequired: true, phase: 'idle' })
      const { useAppStore } = await import('../store/useAppStore')
      useAppStore.getState().suspendAuthSession()
      throw new ApiRequestError('请重新登录后继续', 0, 'SESSION_EXPIRED')
    }
    if (sessionUnauthorized && mayRecover) {
      try {
        const recovery = recoverSessionToken()
        const token = await (options.signal ? abortable(recovery, options.signal) : recovery)
        options.signal?.throwIfAborted()
        if (token) return executeApiRequest<T>(path, { ...options, token }, false)
        if (useBrowserRecoveryState.getState().reauthenticationRequired) throw new ApiRequestError('请重新登录后继续', 0, 'SESSION_EXPIRED')
      } catch {
        options.signal?.throwIfAborted()
        if (useBrowserRecoveryState.getState().reauthenticationRequired) throw new ApiRequestError('请重新登录后继续', 0, 'SESSION_EXPIRED')
        throw new ApiRequestError('暂时无法恢复使用状态，请检查网络后重试', 503, 'SESSION_RECOVERY_FAILED')
      }
    }
    const failure=new ApiRequestError(
      errorBody?.error?.message ?? '请求失败，请稍后重试',
      response.status,
      errorBody?.error?.code
    )
    Object.defineProperty(failure,'preview',{value:errorBody?.error?.preview,enumerable:false})
    throw failure
  }

  options.signal?.throwIfAborted()
  if (changesData && typeof window !== 'undefined') {
    if(mutationScope && options.method)trackSavedMutation(mutationScope,path,options.method,options.body,data)
    window.dispatchEvent(new Event('hoooho-data-changed'))
  }
  return data as T
}

export function apiRequest<T>(path: string, options: ApiRequestOptions): Promise<T> {
  return executeApiRequest<T>(path, options, true)
}

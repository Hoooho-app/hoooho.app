import assert from 'node:assert/strict'
import test from 'node:test'
import { AuthApiError, postAuthRequest } from './auth.ts'

const originalFetch = globalThis.fetch

function restoreFetch() {
  globalThis.fetch = originalFetch
}

test('email rate limit exposes a useful retry message and request id', async (context) => {
  context.after(restoreFetch)
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { code: 'CODE_RATE_LIMITED', message: '请稍后重试', retryAfter: 42 }
  }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'X-Hoooho-Request-ID': 'mobile-request-123' }
  })

  await assert.rejects(
    postAuthRequest('/api/auth/email/send-code', { email: 'user@example.com' }),
    (error: unknown) => error instanceof AuthApiError
      && error.message === '验证码已发送，请 42 秒后再试'
      && error.retryAfter === 42
      && error.status === 429
      && error.requestId === 'mobile-request-123'
  )
})

test('non-json 403 is classified as a browser or network security block', async (context) => {
  context.after(restoreFetch)
  globalThis.fetch = async () => new Response('<html>challenge</html>', {
    status: 403,
    headers: { 'Content-Type': 'text/html' }
  })

  await assert.rejects(
    postAuthRequest('/api/auth/email/send-code', { email: 'user@example.com' }),
    (error: unknown) => error instanceof AuthApiError
      && error.message === '请求被浏览器或网络安全策略拦截，请使用系统浏览器重试'
      && error.status === 403
  )
})

test('email provider failures use the public service unavailable message', async (context) => {
  context.after(restoreFetch)
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { code: 'EMAIL_PROVIDER_UNAVAILABLE', message: 'internal provider message' }
  }), { status: 503, headers: { 'Content-Type': 'application/json' } })

  await assert.rejects(
    postAuthRequest('/api/auth/email/send-code', { email: 'user@example.com' }),
    (error: unknown) => error instanceof AuthApiError
      && error.message === '邮件服务暂时不可用，请稍后重试'
      && error.status === 503
  )
})

test('fetch failures are classified as network errors', async (context) => {
  context.after(restoreFetch)
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }

  await assert.rejects(
    postAuthRequest('/api/auth/email/send-code', { email: 'user@example.com' }),
    (error: unknown) => error instanceof AuthApiError
      && error.code === 'AUTH_NETWORK_ERROR'
      && error.message === '网络连接异常，请检查网络后重试'
  )
})

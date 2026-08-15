import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiRequestError, apiRequest, reliableFetch } from './apiClient.ts'

test('GET 读取失败后只自动重试一次', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return calls === 1
      ? new Response('{"error":{"message":"temporary"}}', { status: 503 })
      : new Response('{"ok":true}', { status: 200 })
  }
  try {
    assert.deepEqual(await apiRequest<{ ok: boolean }>('/api/events', { token: 'token', timeoutMs: 100 }), { ok: true })
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('请求在总预算内结束并返回明确超时错误', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
    calls += 1
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
  })
  const startedAt = Date.now()
  try {
    await assert.rejects(
      apiRequest('/api/members', { token: 'token', timeoutMs: 40 }),
      (error) => error instanceof ApiRequestError && error.status === 408 && error.code === 'REQUEST_TIMEOUT'
    )
    assert.equal(calls, 2)
    assert.ok(Date.now() - startedAt < 150)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('调用方主动取消不会被识别为超时或触发重试', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
    calls += 1
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
  })
  const controller = new AbortController()
  const request = reliableFetch('/api/events', { signal: controller.signal, timeoutMs: 100 })
  controller.abort()
  try {
    await assert.rejects(request, (error) => error instanceof DOMException && error.name === 'AbortError')
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('响应头已返回但 body 长期 pending 仍受总超时保护', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_input, init) => new Response(new ReadableStream({
    start(controller) {
      init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')), { once: true })
    }
  }), { status: 200 })
  try {
    await assert.rejects(
      apiRequest('/api/events', { token: 'token', timeoutMs: 40, retries: 0 }),
      (error) => error instanceof ApiRequestError && error.code === 'REQUEST_TIMEOUT'
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

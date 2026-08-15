import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { performance } from 'node:perf_hooks'
import test from 'node:test'
import { measureRequestPhase, recordSerializationTime, startRequestPerformanceTrace } from './request-performance.mjs'

test('API 性能日志包含分段、总耗时、状态码和慢请求标记', async () => {
  const response = new EventEmitter()
  response.statusCode = 200
  const logs = []
  startRequestPerformanceTrace({ method: 'GET' }, response, '/api/events', (line) => logs.push(JSON.parse(line)))
  await measureRequestPhase(response, 'authMs', async () => 'account-1')
  await measureRequestPhase(response, 'healthEventsQueryMs', async () => [])
  const serializeStartedAt = performance.now()
  JSON.stringify([])
  recordSerializationTime(response, serializeStartedAt)
  response.emit('finish')

  assert.equal(logs.length, 2)
  assert.equal(logs[0].type, 'api_request_received')
  assert.equal(logs[1].type, 'api_performance')
  assert.equal(logs[1].route, '/api/events')
  assert.equal(logs[1].status, 200)
  assert.equal(typeof logs[1].authMs, 'number')
  assert.equal(typeof logs[1].healthEventsQueryMs, 'number')
  assert.equal(typeof logs[1].serializeMs, 'number')
  assert.equal(typeof logs[1].totalMs, 'number')
  assert.equal(logs[1].slow, false)
})

test('超过阈值仍未完成的请求立即记录 pending 阶段', async () => {
  const response = new EventEmitter()
  response.statusCode = 200
  const logs = []
  startRequestPerformanceTrace({ method: 'GET' }, response, '/api/members', (line) => logs.push(JSON.parse(line)), 5)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(logs.some((entry) => entry.type === 'api_slow_pending' && entry.elapsedMs === 5), true)
  response.emit('finish')
})

import { performance } from 'node:perf_hooks'

const traces = new WeakMap()

export function startRequestPerformanceTrace(request, response, route, logger = console.info, slowThresholdMs = 2_000) {
  const trace = {
    route,
    method: request.method ?? 'GET',
    startedAt: performance.now(),
    timings: {}
  }
  traces.set(response, trace)
  logger(JSON.stringify({ type: 'api_request_received', route, method: trace.method }))
  const slowTimer = setTimeout(() => {
    logger(JSON.stringify({
      type: 'api_slow_pending',
      route: trace.route,
      method: trace.method,
      ...trace.timings,
      elapsedMs: slowThresholdMs
    }))
  }, slowThresholdMs)
  response.once('finish', () => {
    clearTimeout(slowTimer)
    const totalMs = Math.round((performance.now() - trace.startedAt) * 10) / 10
    logger(JSON.stringify({
      type: 'api_performance',
      route: trace.route,
      method: trace.method,
      status: response.statusCode,
      ...trace.timings,
      totalMs,
      slow: totalMs > slowThresholdMs
    }))
    traces.delete(response)
  })
}

export async function measureRequestPhase(response, name, operation) {
  const startedAt = performance.now()
  try {
    return await operation()
  } finally {
    const trace = traces.get(response)
    if (trace) trace.timings[name] = Math.round((performance.now() - startedAt) * 10) / 10
  }
}

export function recordSerializationTime(response, startedAt) {
  const trace = traces.get(response)
  if (trace) trace.timings.serializeMs = Math.round((performance.now() - startedAt) * 10) / 10
}

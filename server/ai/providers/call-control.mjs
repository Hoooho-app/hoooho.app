import { AsyncLocalStorage } from 'node:async_hooks'
import { boundedSetting, configurationError } from './provider-config.mjs'

const context = new AsyncLocalStorage()
const slotContext = new AsyncLocalStorage()
const slotWaiters = new Set()
const calls = new Map()
let active = 0
export const withAIAccount = (accountId, operation) => context.run(accountId, operation)
// Opt-in scheduling for dependent food-label checks, never an outbound retry.
export const withQueuedAIAccount = (accountId, operation, signal) => {
  const budget = AbortSignal.timeout(60000)
  return slotContext.run(signal ? AbortSignal.any([signal, budget]) : budget, () => withAIAccount(accountId, operation))
}

function waitForSlot(signal) {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const cleanup = () => { slotWaiters.delete(ready); signal.removeEventListener('abort', aborted) }
    const ready = () => { cleanup(); resolve() }
    const aborted = () => { cleanup(); reject(signal.reason) }
    slotWaiters.add(ready)
    signal.addEventListener('abort', aborted, { once: true })
  })
}

// Actual outbound calls, including failed calls, count toward the limit. No retries.
// This app is single-instance; multiple replicas require a shared limiter first.
export async function controlledCall(operation, env = process.env) {
  const max = boundedSetting(env, 'AI_MAX_CONCURRENT_CALLS', 2, 1, 10)
  const hourly = boundedSetting(env, 'AI_MAX_CALLS_PER_ACCOUNT_HOUR', 30, 1, 1000)
  const queuedAt=Date.now()
  const queuedSignal = slotContext.getStore()
  queuedSignal?.throwIfAborted()
  if (queuedSignal) while (active >= max) await waitForSlot(queuedSignal)
  queuedSignal?.throwIfAborted()
  if (active >= max) throw Object.assign(configurationError('整理服务繁忙，请稍后重试；原内容仍保留', 'AI_CONCURRENCY_LIMIT'), { status: 429 })
  const accountId = context.getStore(), now = Date.now()
  for (const [id, value] of calls) if (now - value.started >= 3600000) calls.delete(id)
  if (accountId) {
    const value = calls.get(accountId) ?? { started: now, count: 0 }
    if (value.count >= hourly) throw Object.assign(configurationError('本小时 AI 整理次数已达上限，仍可手动记录和导出', 'AI_ACCOUNT_CALL_LIMIT'), { status: 429 })
    value.count++; calls.set(accountId, value)
  }
  active++
  try { return await operation({queueWaitMs:Date.now()-queuedAt}) } finally { active--; for (const ready of [...slotWaiters]) ready() }
}

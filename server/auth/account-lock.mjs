import { AsyncLocalStorage } from 'node:async_hooks'
const active = new AsyncLocalStorage()
const queues = new Map()
export function withAccountLock(accountId, operation) {
  if (!accountId || active.getStore() === accountId) return operation()
  const result = (queues.get(accountId) ?? Promise.resolve()).then(() => active.run(accountId, operation))
  const tail = result.catch(() => undefined)
  queues.set(accountId, tail)
  void tail.finally(() => { if (queues.get(accountId) === tail) queues.delete(accountId) })
  return result
}

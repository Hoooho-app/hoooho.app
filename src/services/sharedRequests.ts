import { abortable } from './abortable'

// Only in-flight work is shared. Completed results are never retained here.
export function createSharedRequests<T>(load: (key: string, signal: AbortSignal) => Promise<T>, timeoutMs = 12000) {
  const pending = new Map<string, { promise: Promise<T>; controller: AbortController }>()
  const invalidate = (key?: string) => {
    for (const [id, entry] of pending) if (key === undefined || key === id) {
      pending.delete(id)
      entry.controller.abort()
    }
  }
  return {
    invalidate,
    get(key: string): Promise<T> {
      const existing = pending.get(key)
      if (existing) return existing.promise
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs)
      const entry = { controller, promise: undefined as unknown as Promise<T> }
      entry.promise = abortable(Promise.resolve().then(() => load(key, controller.signal)), controller.signal).finally(() => {
        clearTimeout(timer)
        if (pending.get(key) === entry) pending.delete(key)
      })
      pending.set(key, entry)
      return entry.promise
    },
  }
}

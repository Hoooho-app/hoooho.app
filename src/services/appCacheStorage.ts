import type { StateStorage } from 'zustand/middleware'

type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const unavailable = (error: unknown) => Boolean(error && typeof error === 'object' && 'name' in error &&
  ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED', 'SecurityError'].includes(String(error.name)))

/** Only the app's cached identity/member metadata uses this adapter. Formal
 * records, archive writes and file/draft transactions retain their own errors. */
export function createAppCacheStorage(access: () => StorageAccess | undefined = () => typeof localStorage === 'undefined' ? undefined : localStorage) {
  let writable = true
  const storage: StateStorage = {
    getItem(name) {
      try { const target = access(); if (!target) writable = false; return target?.getItem(name) ?? null }
      catch (error) { if (!unavailable(error)) throw error; writable = false; return null }
    },
    setItem(name, value) {
      try { const target = access(); if (!target) { writable = false; return }; target.setItem(name, value); writable = true }
      catch (error) { if (!unavailable(error)) throw error; writable = false }
    },
    removeItem(name) {
      try { const target = access(); if (!target) writable = false; target?.removeItem(name) }
      catch (error) { if (!unavailable(error)) throw error; writable = false }
    }
  }
  return { storage, isWritable: () => writable }
}

export const appCache = createAppCacheStorage()

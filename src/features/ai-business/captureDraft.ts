import type { BodyLocationSelection } from '../body-location'
import type { ObservationResult } from '../case-continuity/types'
export interface CaptureDraft { text: string; files: File[]; occurredAt: string; timeUnknown: boolean; requestId: string; eventId?: string; supplement?: string; bodyLocations?: string[]; locations?: BodyLocationSelection[]; result?: ObservationResult; aiDraftId?: string; identity?: import('../case-continuity/types').MaterialIdentity }
const database = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('hoooho-smart-record-drafts', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('drafts')
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
export function guestDraftKeys(key: string, keys: IDBValidKey[], owner: {accountId:string;memberId:string}) {
  const prefix = key.startsWith('return:') ? 'return:' : '', target = `${prefix}${owner.accountId}`
  if (owner.accountId.startsWith('guest:') || !key.startsWith(`${target}:${owner.memberId}:`)) return []
  const suffix = key.slice(target.length)
  return keys.filter((candidate):candidate is string => typeof candidate === 'string' && candidate.startsWith(`${prefix}guest:`) && candidate.endsWith(suffix))
}
// The caller must first verify member ownership with the authenticated server.
// Existing guest merges preserve member/event IDs. Only one exact-context local
// draft may follow that owned member; no all-guest/account-wide import occurs.
export async function captureDraft(key: string, value?: CaptureDraft | null, verifiedOwner?: {accountId:string;memberId:string}): Promise<CaptureDraft | null> {
  const db = await database()
  try { return await new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', value === undefined && !verifiedOwner ? 'readonly' : 'readwrite')
    const store = transaction.objectStore('drafts')
    const request = value === undefined ? store.get(key) : value === null ? store.delete(key) : store.put(value, key)
    let restored:CaptureDraft|null = null
    if (value === undefined) request.onsuccess = () => {
      restored = request.result ?? null
      if (!restored && verifiedOwner) {
        const keys = store.getAllKeys()
        keys.onsuccess = () => {
          const candidates = guestDraftKeys(key,keys.result,verifiedOwner)
          if (candidates.length !== 1) return
          const original = store.get(candidates[0])
          original.onsuccess = () => { if (original.result) { restored=original.result;store.put(restored,key);store.delete(candidates[0]) } }
        }
      }
    }
    transaction.oncomplete = () => resolve(value === undefined ? restored : value)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  }) } finally { db.close() }
}

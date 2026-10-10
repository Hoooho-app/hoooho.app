import type { BodyLocationSelection } from '../body-location'
import type { ObservationResult } from '../case-continuity/types'
import {storeDraftFile,restoreDraftFile,type StoredDraftFile} from './draftFiles'
export interface CaptureDraft { text: string; conversationInput?: string; conversationTurns?: {id:string;text:string}[]; voiceTranscript?:string; files: File[]; occurredAt: string; timeUnknown: boolean; requestId: string; eventId?: string; supplement?: string; bodyLocations?: string[]; locations?: BodyLocationSelection[]; result?: ObservationResult; aiDraftId?: string; identity?: import('../case-continuity/types').MaterialIdentity; pendingVoice?: File; smartReview?: import('./smartRecordTypes').SmartRecordDraft }
type StoredDraft=Omit<CaptureDraft,'files'|'pendingVoice'>&{files:(StoredDraftFile|File)[];pendingVoice?:StoredDraftFile|File}
export async function packCaptureDraft(value:CaptureDraft):Promise<StoredDraft>{
  const files=await Promise.all(value.files.map(storeDraftFile)),index=value.pendingVoice?value.files.indexOf(value.pendingVoice):-1
  return {...value,files,pendingVoice:value.pendingVoice?(index>=0?files[index]:await storeDraftFile(value.pendingVoice)):undefined}
}
export function unpackCaptureDraft(value:StoredDraft):CaptureDraft{
  const files=value.files.map(restoreDraftFile),index=value.pendingVoice?value.files.indexOf(value.pendingVoice):-1
  return {...value,files,pendingVoice:value.pendingVoice?(index>=0?files[index]:restoreDraftFile(value.pendingVoice)):undefined}
}
export function appendCaptureTurn(value:CaptureDraft,text:string,id:string=crypto.randomUUID()):CaptureDraft{
  const turns=value.conversationTurns??(value.text.trim()?[{id:'legacy',text:value.text}]:[])
  if(turns.some(turn=>turn.id===id))return {...value,pendingVoice:undefined}
  const conversationTurns=[...turns,{id,text:text.trim()}],combined=conversationTurns.map(turn=>turn.text).join('\n')
  if(combined.length>5000)throw Object.assign(new Error('这段记录较长，请先保存，再继续记录。录音仍然保留。'),{code:'CAPTURE_TEXT_TOO_LONG'})
  return {...value,text:combined,conversationTurns,conversationInput:'',pendingVoice:undefined}
}
const database = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('hoooho-smart-record-drafts', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('drafts')
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
export const hasCaptureContent = (draft: CaptureDraft | null) => Boolean(draft && (draft.text.trim() || draft.conversationInput?.trim() || draft.files.length || draft.pendingVoice || draft.smartReview?.items.length))

/** Only retained drafts of this exact account/member/event context are read. */
export async function retainedCaptureDrafts(key: string): Promise<{ key: string; draft: CaptureDraft }[]> {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('drafts', 'readonly')
      const request = transaction.objectStore('drafts').openCursor()
      const drafts: { key: string; draft: CaptureDraft }[] = []
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        if (typeof cursor.key === 'string' && cursor.key.startsWith(`${key}:retained:`)) {
          const draft = unpackCaptureDraft(cursor.value)
          if (hasCaptureContent(draft) && draft.smartReview?.state !== 'saved') drafts.push({ key: cursor.key, draft })
        }
        cursor.continue()
      }
      transaction.oncomplete = () => resolve(drafts.sort((a, b) => b.key.localeCompare(a.key)))
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally { db.close() }
}
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
  // Read bytes before opening the IDB transaction; awaiting inside it would let
  // Safari auto-commit. Store bytes rather than OS-backed File references.
  const packed=value?await packCaptureDraft(value):value
  const db = await database()
  try { return await new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', value === undefined && !verifiedOwner ? 'readonly' : 'readwrite')
    const store = transaction.objectStore('drafts')
    const request = value === undefined ? store.get(key) : value === null ? store.delete(key) : store.put(packed, key)
    let restored:CaptureDraft|null = null
    if (value === undefined) request.onsuccess = () => {
      restored = request.result ? unpackCaptureDraft(request.result) : null
      if (!restored && verifiedOwner) {
        const keys = store.getAllKeys()
        keys.onsuccess = () => {
          const candidates = guestDraftKeys(key,keys.result,verifiedOwner)
          if (candidates.length !== 1) return
          const original = store.get(candidates[0])
          original.onsuccess = () => { if (original.result) { restored=unpackCaptureDraft(original.result);store.put(original.result,key);store.delete(candidates[0]) } }
        }
      }
    }
    transaction.oncomplete = () => resolve(value === undefined ? restored : value)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  }) } finally { db.close() }
}

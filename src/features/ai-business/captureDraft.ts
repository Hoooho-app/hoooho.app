import type { BodyLocationSelection } from '../body-location'
import type { ObservationResult } from '../case-continuity/types'
import {storeDraftFile,restoreDraftFile,type StoredDraftFile} from './draftFiles'
export interface CaptureTurn {completedOperation?:boolean;operationResult?:import('./recognitionJobs').CompletedRecordOperation;presentedDraft?:{id:string;version:number};expectedContextVersion?:number;continuationId?:string;answerTo?:{contextId:string;questionId:string};id:string;text:string;at?:number;role?:'user'|'assistant';kind?:'text'|'voice'|'image';fileKeys?:string[];status?:'pending'|'transcribing'|'completed'|'failed';error?:string;errorCode?:string;contextId?:string;reviewId?:string;recordCount?:number}
export interface CaptureDraft { rawSaveTarget?:import('./frontOriginalSave').RawSaveTarget; frontSubject?:import('./frontDeskRecord').FrontSubject; frontContextVersion?:number; followUpEnabled?:boolean; resumeContextId?:string; nursingInterview?:import('./smartRecordTypes').NursingInterview; archivedConversation?:boolean; caseRecognitionDraft?:{id:string;version:number}; visitMaterials?: import('../visit-materials/types').VisitMaterialsDeviceDraft; rawSavedGuide?:import('./savedRecordGuide').SavedRecordGuide; recognitionSubmittedFiles?:string[]; appliedVoiceJobIds?:string[]; recognitionJobId?:string; recognitionAssets?:Record<string,string>; recognitionSnapshot?:import('./recognitionJobs').RecognitionJob; pendingRecognitionCommand?:{id:string;type:'discard'}; savedGuides?: import('./savedRecordGuide').SavedRecordGuide[]; returnScrollTop?:number; returningFromRecord?:boolean; text: string; updatedAt?:number; frontContextId?:string; conversationInput?: string; conversationTurns?: CaptureTurn[]; voiceTranscript?:string; files: File[]; occurredAt: string; capturedAt?: string; timeUnknown: boolean; requestId: string; eventId?: string; supplement?: string; bodyLocations?: string[]; locations?: BodyLocationSelection[]; result?: ObservationResult; aiDraftId?: string; identity?: import('../case-continuity/types').MaterialIdentity; pendingVoice?: File; smartReview?: import('./smartRecordTypes').SmartRecordDraft }
type StoredDraft=Omit<CaptureDraft,'files'|'pendingVoice'>&{files:(StoredDraftFile|File)[];pendingVoice?:StoredDraftFile|File}
const checkpointKey=(key:string)=>`hoooho-capture-checkpoint:${key}`
const finalizations=new Map<string,Promise<void>>()
/** Back navigation does not wait; reopening waits only for the final byte save. */
export function beginCaptureFinalization(key:string){let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve}),previous=finalizations.get(key)??Promise.resolve(),combined=Promise.all([previous,pending]).then(()=>undefined);finalizations.set(key,combined);let finished=false;return()=>{if(finished)return;finished=true;release();void combined.then(()=>{if(finalizations.get(key)===combined)finalizations.delete(key)})}}
export const fileIdentity=(file:File)=>JSON.stringify([file.name,file.type,file.size,file.lastModified])
function checkpointValue(value:CaptureDraft){const {files,pendingVoice,...metadata}=value;return JSON.stringify({metadata,files:files.map(fileIdentity),pendingVoice:pendingVoice?fileIdentity(pendingVoice):null})}
// A tiny synchronous journal protects metadata while the existing IDB byte
// transaction is pending. It contains no encoded audio/images and is scoped to
// the same account/member/context key, not a second draft or routing system.
export function checkpointCaptureDraft(key:string,value:CaptureDraft){
  try{sessionStorage.setItem(checkpointKey(key),checkpointValue(value))}catch{/* IDB remains authoritative; storage denial does not discard the draft. */}
}
function restoreCheckpoint(key:string,value:CaptureDraft|null):CaptureDraft|null{
  try{const saved=JSON.parse(sessionStorage.getItem(checkpointKey(key))??'null');if(!saved)return value
    if(!value)return saved.files.length===0&&!saved.pendingVoice?{...saved.metadata,files:[]}:null
    if(saved.metadata.requestId!==value.requestId)return value
    const files=value.files.filter(file=>saved.files.includes(fileIdentity(file)))
    const pendingVoice=saved.pendingVoice?(files.find(file=>fileIdentity(file)===saved.pendingVoice)??(value.pendingVoice&&fileIdentity(value.pendingVoice)===saved.pendingVoice?value.pendingVoice:undefined)):undefined
    if((saved.metadata.updatedAt??0)<(value.updatedAt??0))return value
    return {...value,...saved.metadata,files,pendingVoice}
  }catch{return value}
}
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
export const hasCaptureContent = (draft: CaptureDraft | null) => Boolean(draft && (draft.text.trim() || draft.conversationInput?.trim() || draft.files.length || draft.pendingVoice || draft.smartReview?.items.length || draft.rawSaveTarget))

export async function pendingCaptureCancellations(key:string):Promise<{key:string;draft:CaptureDraft}[]>{
  const db=await database()
  try{return await new Promise((resolve,reject)=>{const transaction=db.transaction('drafts','readonly'),request=transaction.objectStore('drafts').openCursor(),items:{key:string;draft:CaptureDraft}[]=[];request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;if(typeof cursor.key==='string'&&cursor.key.startsWith(`${key}:cancel:`))items.push({key:cursor.key,draft:unpackCaptureDraft(cursor.value)});cursor.continue()};transaction.oncomplete=()=>resolve(items);transaction.onerror=()=>reject(transaction.error)})}finally{db.close()}
}

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
      transaction.oncomplete = () => resolve(drafts.sort((a, b) => (b.draft.updatedAt??Number(b.key.split(':retained:')[1]?.split(':')[0])??0)-(a.draft.updatedAt??Number(a.key.split(':retained:')[1]?.split(':')[0])??0)))
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
const draftOperations=new Map<string,Promise<unknown>>()
export async function captureDraft(key: string, value?: CaptureDraft | null, verifiedOwner?: {accountId:string;memberId:string}): Promise<CaptureDraft | null> {
  // Byte snapshots can complete out of order. Serialize an owner's exact key
  // so a slow media write cannot overwrite a later edit or explicit removal.
  if(value===undefined)await finalizations.get(key)
  const previous=draftOperations.get(key)??Promise.resolve()
  const operation=previous.catch(()=>undefined).then(()=>captureDraftOnce(key,value,verifiedOwner))
  draftOperations.set(key,operation)
  try{return await operation}finally{if(draftOperations.get(key)===operation)draftOperations.delete(key)}
}
async function captureDraftOnce(key: string, value?: CaptureDraft | null, verifiedOwner?: {accountId:string;memberId:string}): Promise<CaptureDraft | null> {
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
    transaction.oncomplete = () => {
      try{if(value===null||(value&&sessionStorage.getItem(checkpointKey(key))===checkpointValue(value)))sessionStorage.removeItem(checkpointKey(key))}catch{/* Storage may be disabled. */}
      resolve(value === undefined ? restoreCheckpoint(key,restored) : value)
    }
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  }) } finally { db.close() }
}

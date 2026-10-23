import { useEffect, useRef, useState } from 'react'
import { HohoButton } from '../../components/design-system'
import { SymptomRecordFlow } from '../../pages/HealthEvents/SymptomRecordFlow'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import { useAppStore } from '../../store/useAppStore'
import { localMediaDraft } from '../health-attachments/localMediaDraft'
import { caseService } from '../case-continuity/api'
import { NurseMessage } from '../ai-nurse/NurseMessage'
import {fileBytes} from './draftFiles'
import type { SavedRecordGuide } from './savedRecordGuide'

type IncomingVideo = { id: string; file: File; origin: 'capture' | 'library' }
type VideoDraft = { requestId: string; incomingId?: string; savedGuide?: SavedRecordGuide }
export function FrontDeskVideoRecorder({ accountId, memberId, token, incoming, onIncomingConsumed, onSavedGuide }: {
  accountId: string; memberId: string; token: string; incoming?: IncomingVideo
  onIncomingConsumed: (id: string) => void; onSavedGuide: (guide: SavedRecordGuide) => Promise<void>
}) {
  const draftScope = `front-video:${accountId}:${memberId}`
  const scope = `${accountId}:${memberId}:symptom:${draftScope}`
  const storageKey = `hoooho-front-video:${accountId}:${memberId}`
  const [draft, setDraft] = useState<VideoDraft | undefined>(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); return saved?.requestId ? saved : undefined } catch { return undefined }
  })
  const draftRef = useRef(draft); draftRef.current = draft
  const [open, setOpen] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0)
  const callbacks = useRef({ onIncomingConsumed, onSavedGuide }); callbacks.current = { onIncomingConsumed, onSavedGuide }
  const belongsHere = () => { const state = useAppStore.getState(); return state.authUser?.id === accountId && state.currentMemberId === memberId }
  const retain = (value: VideoDraft) => { sessionStorage.setItem(storageKey, JSON.stringify(value)); draftRef.current = value; setDraft(value) }
  useEffect(()=>{
    if(draftRef.current||incoming)return
    let active=true
    void localMediaDraft.list(scope).then(pending=>{if(active&&belongsHere()&&!draftRef.current&&pending.length)retain({requestId:crypto.randomUUID(),incomingId:pending[0].localId})}).catch(()=>{if(active)setError('本机视频草稿暂时无法恢复，请刷新重试')})
    return()=>{active=false}
  },[scope])
  useEffect(() => {
    if (!incoming) return
    let active = true; setError('')
    void (async () => {
      // Persist bytes before opening the recorder; a React state or route change must not own the only copy.
      const original=new File([await fileBytes(incoming.file)],incoming.file.name,{type:incoming.file.type,lastModified:incoming.file.lastModified})
      await localMediaDraft.put({ key: `${scope}:${incoming.id}`, scope, localId: incoming.id, file: original, origin: incoming.origin, createdAt: Date.now() })
      if (!active || !belongsHere()) return
      if(draftRef.current?.savedGuide)throw new Error('请先恢复上一条视频的保存结果，再添加新视频')
      retain({ requestId: draftRef.current?.requestId ?? crypto.randomUUID(), incomingId: incoming.id })
      callbacks.current.onIncomingConsumed(incoming.id); setOpen(true)
    })().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '视频尚未保留，请重试') })
    return () => { active = false }
  }, [incoming?.id, scope, attempt])
  const clearSavedDraft=()=>{
    sessionStorage.removeItem(storageKey)
    sessionStorage.removeItem(`hoooho-quick-record-photo-draft:symptom:${draftScope}:${memberId}`)
    sessionStorage.removeItem(`hoooho-symptom-record-draft:${accountId}:${draftScope}`)
    draftRef.current=undefined;setDraft(undefined);setOpen(false);setError('');if(incoming)setAttempt(n=>n+1)
  }
  const restoreReceipt=async()=>{
    const guide=draftRef.current?.savedGuide
    if(!guide||!belongsHere())return
    try{await callbacks.current.onSavedGuide(guide);clearSavedDraft()}
    catch{setError('记录已保存，结果尚未显示在对话中。请重试恢复结果。')}
  }
  const today = getLocalDateKey(new Date())!
  return <>
    {draft?.savedGuide&&<NurseMessage conversation role="assistant"><p>视频记录已保存，正在保留保存结果。</p>{error&&<p role="alert">{error}</p>}<HohoButton onClick={()=>void restoreReceipt()}>恢复视频保存结果</HohoButton></NurseMessage>}
    {(draft || error) && !draft?.savedGuide && !open && <NurseMessage conversation role="assistant">
      <p>{error ? '视频尚未导入，当前对话仍然保留。' : '视频草稿已保留，可以继续核对。'}</p>
      {error && <p role="alert">{error}</p>}
      <HohoButton variant="secondary" onClick={() => error && incoming ? setAttempt(value => value + 1) : setOpen(true)}>{error && incoming ? '重试导入视频' : '继续核对视频'}</HohoButton>
    </NurseMessage>}
    {open && draft && !draft.savedGuide && <SymptomRecordFlow memberId={memberId} token={token} selectedDay={today} today={today} title="核对视频记录" draftScope={draftScope}
      requireAllMediaUploaded incomingMedia={draft.incomingId ? { id: draft.incomingId, scope } : undefined}
      onIncomingMediaConsumed={id => { if (draftRef.current?.incomingId === id) retain({ requestId: draftRef.current.requestId }) }}
      onBack={() => setOpen(false)} onClose={() => setOpen(false)}
      onConfirm={async (text, occurredAt, _channel, photos, journal) => {
        if (!belongsHere() || !draftRef.current) throw new Error('记录对象已切换，请回到原视频草稿')
        const requestId = draftRef.current.requestId
        const result = await caseService.capture(memberId, token, { requestId, text, occurredAt, timeUnknown: journal.timePrecision === 'unknown', journal, photoDraftId: photos.draftId, photoIds: photos.photoIds, files: [] })
        const guide:SavedRecordGuide={ id: `front-video:${requestId}:${result.recordId}`, memberId, eventId: result.eventId, recordId: result.recordId, category: 'symptom', text: '视频记录已保存，可查看原件。', at: Date.now() }
        // A durable receipt separates an acknowledged server write from a failed chat checkpoint.
        retain({requestId,savedGuide:guide})
        if (!belongsHere()) throw new Error('视频已保存到原记录对象，请切回查看')
        try{await callbacks.current.onSavedGuide(guide);clearSavedDraft()}catch{setError('视频已保存，请恢复保存结果。')}
        return '视频记录已保存'
      }}
      onSaved={()=>undefined} />}
  </>
}

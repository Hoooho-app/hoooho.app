import { Stethoscope } from 'lucide-react'
import { nurseGreetingText } from '../../../shared/nurse-greeting.mjs'
import { NurseMessage } from './NurseMessage'
import type { JournalMetadata } from '../../types/journal'
import { useEffect, useRef, useState } from 'react'
import { BottomSheetSurface, HohoButton, DialogueComposer } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { nurseApi } from './api'
import { useSmartRecordVoice } from '../ai-business/useSmartRecordVoice'
import {useDialogueSpeech} from './useDialogueSpeech'
import type {DialoguePhotoSource} from '../../components/design-system/DialogueComposer'
import { captureDraft } from '../ai-business/captureDraft'
import { localDateTimeValue } from '../../utils/healthOccurredAt'
import type { NurseDraft, NurseFields, NurseMetadata, NurseState, NurseTurn } from './types'

export function NursePanel({ memberId, token, scope, onClose, onApply, initialReview, onPaused, formContext, initialMode, resuming, onPhoto, photoCount = 0 }: { memberId: string; token: string; scope: string; onClose: () => void; onApply: (fields: Partial<NurseFields>, metadata: NurseMetadata, form?: JournalMetadata, restore?:boolean, warnings?:string[]) => void; initialReview?: NurseDraft['review']; onPaused:()=>void; formContext:JournalMetadata; initialMode?: 'voice' | 'text'; resuming?: boolean; onPhoto:(source:DialoguePhotoSource)=>void; photoCount?:number }) {
  const recorderName = useAppStore(store => store.accountProfile?.nickname || store.authUser?.nickname || store.profile?.nickname)
  const conversationRef = useRef<HTMLDivElement>(null)
  const speech=useDialogueSpeech()
  const [draft, setDraft] = useState<NurseDraft>()
  const [state, setState] = useState<NurseState>(resuming ? 'paused' : 'idle'), [error, setError] = useState(''), [input, setInput] = useState('')
  const draftRef = useRef<NurseDraft>(), controller = useRef<AbortController>(), mounted = useRef(true), sequence = useRef(Promise.resolve()), busy = useRef(false)
  const identity = useRef(useAppStore.getState().authUser?.id)
  const pending = useRef<NurseTurn[]>([]), [pendingCount, setPendingCount] = useState(0)
  const stopOpening=speech.stop
  const pendingKey = `hoooho-nurse-pending:${identity.current}:${memberId}:${scope}`
  const stash = () => { if (active()) { sessionStorage.setItem(pendingKey, JSON.stringify(pending.current)); setPendingCount(pending.current.length) } }
  const active = () => mounted.current && useAppStore.getState().currentMemberId === memberId && useAppStore.getState().authUser?.id === identity.current
  const accept = (value: NurseDraft) => { draftRef.current = value; if (active()) { pending.current=pending.current.filter(turn=>!value.turns.some(saved=>saved.id===turn.id));stash();setDraft(value);const last=value.turns.at(-1);if(last?.role==='assistant')speech.speak(nurseGreetingText(last.text,value.turns.length-1),last.id) } }
  const pause = () => { stopOpening(); voice.stop(); if (active()) setState('paused') }
  useEffect(() => {
    mounted.current = true; const abort = new AbortController()
    try { pending.current = JSON.parse(sessionStorage.getItem(pendingKey) || '[]'); setPendingCount(pending.current.length) } catch { pending.current = [] }
    void nurseApi.open(memberId, token, scope, abort.signal).then(async value => { if (active()){const next=await nurseApi.change(memberId,token,value,{formContext},abort.signal);if(active()){accept(next)}} }).catch(e => { if (active() && e.name !== 'AbortError') setError(e.message) })
    const hidden = () => { if (document.hidden) pause() }, exit = () => pause(), offline=()=>{pause();setState('disconnected');setError('连接中断，刚才的内容还在，可以稍后重试。')}
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', exit); window.addEventListener('offline', offline)
    const unsubscribe = useAppStore.subscribe(current => { if (current.currentMemberId !== memberId || current.authUser?.id !== identity.current) { stopOpening(); controller.current?.abort(); mounted.current = false; pending.current = []; setDraft(undefined); setInput('') } })
    return () => { stopOpening(); mounted.current = false; abort.abort(); controller.current?.abort(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', exit); window.removeEventListener('offline', offline); unsubscribe() }
  }, [memberId, scope])
  const append = async (turn: NurseTurn) => {
    const current = draftRef.current
    if (!current || !active() || current.turns.some(t => t.id === turn.id)) return
    if (!pending.current.some(t => t.id === turn.id)) { pending.current.push(turn); stash() }
    const next = await nurseApi.change(memberId, token, current, { turn })
    pending.current = pending.current.filter(t => t.id !== turn.id); stash(); accept(next)
  }
  const retrySync = async () => {
    if (!draftRef.current || busy.current) return
    speech.activate();busy.current = true; setError(''); setState('processing'); const unsynced = pending.current.map(t => t.text)
    try { accept(await nurseApi.get(memberId, token, draftRef.current.id)); for (const turn of [...pending.current]) { await append(turn); if (draftRef.current?.turns.some(t => t.id === turn.id)) { pending.current = pending.current.filter(t => t.id !== turn.id); stash() } } setInput(current => unsynced.includes(current.trim()) ? '' : current);await captureDraft(voiceKey,null);setPendingVoice(undefined);voice.clearError();accept(await nurseApi.generate(memberId,token,draftRef.current!,false));setState('idle') }
    catch (e) { setError(e instanceof Error ? e.message : '同步失败，原话保留'); setState('error') }
    finally { busy.current = false }
  }
  const organize = async () => {
    if (busy.current || !draftRef.current) return
    busy.current = true; setError(''); stopOpening(); voice.stop()
    await sequence.current
    if (pending.current.length) { setError('还有原话尚未同步，请先重试同步'); busy.current = false; return }
    const current = draftRef.current!
    if (!current.turns.some(t => t.role === 'user')) { setError('请先说出或填写本次情况'); busy.current = false; return }
    const review = current.review
    if (review && review.metadata.turns.length === current.turns.length && review.metadata.turns.every((turn, index) => turn.id === current.turns[index].id)) {
      pause(); onApply(review.fields, review.metadata, review.form, true, current.warnings); onClose(); busy.current = false; return
    }
    setState('organizing'); const abort = new AbortController(); controller.current = abort
    try {
      if (initialReview) accept(await nurseApi.change(memberId, token, current, { review: { ...initialReview, metadata: { ...initialReview.metadata, turns: current.turns } } }, abort.signal))
      const result = await nurseApi.generate(memberId, token, draftRef.current!, true, abort.signal)
      if (!active()) return
      accept(result)
      if (result.emergency) { setError('请先立即联系当地急救或就近急诊，记录可以稍后补充。'); setState('paused'); return }
      setState('reviewing'); onApply(result.fields, { version: 'nurse-v1', fieldSources: result.fieldSources, draftId: result.id, turns: result.turns, professionalNotes: result.notes, snapshots: result.snapshots }, result.review?.form, false, result.warnings); onClose()
    } catch (e) { if (active()) { setError(e instanceof Error ? e.message : '整理失败，原话保留'); setState('error') } }
    finally { busy.current = false }
  }
  const send = async (value = input,turnId:string=crypto.randomUUID()) => {
    if (!value.trim() || busy.current || pending.current.some(turn=>turn.id!==turnId) || !draftRef.current) return false
    speech.activate();busy.current = true; setError('');setState('processing')
    const text = value.trim(); setInput(''); const abort = new AbortController(); controller.current = abort
    const turn: NurseTurn = pending.current.find(t=>t.id===turnId)??draftRef.current!.turns.find(t=>t.id===turnId)??{ id: turnId, role: 'user', text, at: new Date().toISOString(), order: 0, final: true, status: 'completed' }
    queueFinal(turn)
    try {
      await sequence.current
      if (!active() || abort.signal.aborted) return false
      await append(turn)
      const next = await nurseApi.generate(memberId, token, draftRef.current!, false, abort.signal)
      if (!active()) return false
      accept(next); setState(next.emergency ? 'paused' : 'idle')
      if (next.emergency) pause()
      return true

    } catch (e) { if (active()) { setError(e instanceof Error ? e.message : '本轮未成功，原话保留'); setState('error'); if (pending.current.length) setInput(current => current || text) } return active()&&pending.current.length===0 }
    finally { busy.current = false }
  }
  const queueFinal = (turn: NurseTurn) => { if(active()&&!draftRef.current?.turns.some(t=>t.id===turn.id)&&!pending.current.some(t=>t.id===turn.id)){pending.current.push(turn);stash()} }
  const voiceKey=`nurse-voice:${identity.current}:${memberId}:${scope}`
  const [pendingVoice,setPendingVoice]=useState<File>()
  useEffect(()=>{void captureDraft(voiceKey).then(saved=>{if(active())setPendingVoice(saved?.pendingVoice)}).catch(()=>setError('录音草稿没有恢复，请再试一次'))},[voiceKey])
  const voice=useSmartRecordVoice({memberId,token,pendingVoice,onRecorded:async file=>{await captureDraft(voiceKey,{text:'',files:[file],pendingVoice:file,occurredAt:localDateTimeValue(),timeUnknown:false,requestId:crypto.randomUUID()});if(active())setPendingVoice(file)},onTranscript:async (text,file)=>{const accepted=await send(text,`voice:${file.name}:${file.lastModified}`);if(!accepted)throw Object.assign(new Error('刚才的内容尚未发送，录音仍然保留'),{code:'VOICE_DELIVERY_FAILED'});await captureDraft(voiceKey,null);setPendingVoice(undefined)}})
  useEffect(() => { const body = conversationRef.current?.closest('.hoho-bottom-sheet__body'); if (body) body.scrollTop = body.scrollHeight }, [draft?.turns.length, pendingCount, state, voice.state])
  const close = () => { pause(); controller.current?.abort(); onPaused(); onClose() }
  const composer=<DialogueComposer initialTyping={initialMode==='text'} text={input} onTextChange={setInput} onSend={()=>void send()} disabled={busy.current||!draft} voiceDisabled={pendingCount>0||!!pendingVoice} listening={voice.state==='listening'} processing={voice.state==='transcribing'} onStart={()=>{speech.activate();void voice.start()}} onStop={voice.stop} onDiscard={voice.discard} onPhoto={onPhoto}/>
  return <BottomSheetSurface label="智能记录" title="智能记录" leading={<Stethoscope size={21} aria-hidden="true"/>} dismissText="收起" open size="workspace" viewportAware className="nurse-conversation-sheet" layerClassName="symptom-input-layer" onClose={() => void close()} footer={composer}>
    <div ref={conversationRef} className="nurse-conversation" aria-label="本次对话">
      {[...(draft?.turns ?? []), ...pending.current.filter(t => !draft?.turns.some(v => v.id === t.id))].map((turn, index) => <NurseMessage role={turn.role} recorderName={recorderName} key={turn.id} onRead={turn.role==='assistant'&&speech.supported?()=>speech.read(nurseGreetingText(turn.text,index),turn.id):undefined} reading={speech.readingId===turn.id}><p>{turn.role === 'assistant' ? nurseGreetingText(turn.text, index) : turn.text}</p></NurseMessage>)}
      {photoCount>0&&<NurseMessage role="user" recorderName={recorderName}><p>添加了 {photoCount} 份图片或影像。</p></NurseMessage>}
      {!draft&&!error&&<NurseMessage role="assistant"><p role="status">我在找回刚才的对话，请稍等。</p></NurseMessage>}
      {(state==='processing'||state==='organizing'||voice.busy)&&<NurseMessage role="assistant"><p role="status">{voice.state==='listening'?'我在听，松手后就帮你记录。':voice.busy?'我在听这段录音，请稍等。':state==='organizing'?'我在整理刚才的内容。':'让我看看你刚才说的情况。'}</p></NurseMessage>}
      {(error||voice.error)&&<NurseMessage role="assistant"><p role="alert">{error||voice.error}</p>{error&&!pendingCount&&draft?.turns.some(t=>t.role==='user')&&<HohoButton variant="text" disabled={busy.current||voice.busy} onClick={()=>{busy.current=true;setState('processing');setError('');void nurseApi.generate(memberId,token,draftRef.current!,false).then(next=>{if(active()){accept(next);setState(next.emergency?'paused':'idle')}}).catch(e=>{if(active()){setError(e.message);setState('error')}}).finally(()=>{busy.current=false})}}>再试一次</HohoButton>}</NurseMessage>}
      {pendingCount>0&&<NurseMessage role="assistant"><p>刚才的内容还在，要再发送一次吗？</p><HohoButton variant="text" onClick={()=>void retrySync()} disabled={busy.current}>再试一次</HohoButton></NurseMessage>}
      {pendingVoice&&<NurseMessage role="assistant"><p>{voice.unreadable?'这份录音已经无法读取，可以移除后重新录音。已有文字仍然保留。':'这段录音还在，要我再听一次吗？'}</p>{voice.unreadable?<HohoButton variant="text" disabled={busy.current||voice.busy} onClick={()=>void captureDraft(voiceKey,null).then(()=>{setPendingVoice(undefined);voice.clearError()})}>移除无法读取的录音</HohoButton>:<HohoButton variant="text" onClick={voice.retry} disabled={busy.current||voice.busy}>再试一次</HohoButton>}</NurseMessage>}
      {draft?.turns.some(t=>t.role==='user')&&!pendingCount&&!busy.current&&!voice.busy&&<NurseMessage role="assistant"><p>{draft.organizeSuggested?'要我现在把这些内容整理到记录里吗？':'还有想补充的吗？也可以让我先整理刚才说的。'}</p><HohoButton variant="text" onClick={()=>void organize()}>帮我整理</HohoButton></NurseMessage>}

    </div>
  </BottomSheetSurface>
}

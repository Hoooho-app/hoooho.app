import { Mic, Pause, Stethoscope } from 'lucide-react'
import { nurseGreetingText } from '../../../shared/nurse-greeting.mjs'
import { NurseMessage } from './NurseMessage'
import type { JournalMetadata } from '../../types/journal'
import { useEffect, useRef, useState } from 'react'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { nurseApi } from './api'
import { RealtimeNurse } from './RealtimeNurse'
import type { NurseDraft, NurseFields, NurseMetadata, NurseState, NurseTurn } from './types'

const states: Record<NurseState, string> = { idle: '点击开始语音，跟护士说说本次情况', connecting: '正在连接，接通后即可说话', listening: '正在听，请继续说', processing: '护士正在理解，请稍等', speaking: '护士正在回复，你也可以直接说话', paused: '语音已暂停，点击继续语音', disconnected: '连接中断，点击重新连接', organizing: '正在整理，可保留草稿', reviewing: '请核对整理结果', saving: '正在保存', saved: '已保存', error: '语音未连接，可重试或改用文字' }
export function NursePanel({ memberId, token, scope, onClose, onApply, initialReview, onPaused, formContext, initialMode, resuming }: { memberId: string; token: string; scope: string; onClose: () => void; onApply: (fields: Partial<NurseFields>, metadata: NurseMetadata, form?: JournalMetadata, restore?:boolean, warnings?:string[]) => void; initialReview?: NurseDraft['review']; onPaused:()=>void; formContext:JournalMetadata; initialMode?: 'voice' | 'text'; resuming?: boolean }) {
  const entryHandled = useRef(false)
  const [playbackBlocked, setPlaybackBlocked] = useState(false)
  const [mode, setMode] = useState<'voice' | 'text'>(initialMode === 'text' ? 'text' : 'voice')
  const recorderName = useAppStore(store => store.accountProfile?.nickname || store.authUser?.nickname || store.profile?.nickname)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const conversationRef = useRef<HTMLDivElement>(null)
  const [openingNeedsPlay, setOpeningNeedsPlay] = useState(false)
  const [draft, setDraft] = useState<NurseDraft>()
  const [state, setState] = useState<NurseState>(resuming ? 'paused' : 'idle'), [error, setError] = useState(''), [input, setInput] = useState(''), [preview, setPreview] = useState('')
  const draftRef = useRef<NurseDraft>(), rtc = useRef<RealtimeNurse>(), controller = useRef<AbortController>(), mounted = useRef(true), sequence = useRef(Promise.resolve()), busy = useRef(false)
  const identity = useRef(useAppStore.getState().authUser?.id)
  const pending = useRef<NurseTurn[]>([]), [pendingCount, setPendingCount] = useState(0)
  const greetingKey=`hoooho-nurse-greeting:${identity.current}:${memberId}:${scope}`
  const opening=useRef<SpeechSynthesisUtterance>()
  const stopOpening=()=>{if(opening.current){window.speechSynthesis?.cancel();opening.current=undefined}}
  const playOpening=(value:NurseDraft)=>{
    if(!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window)||value.turns.some(t=>t.role==='user')||sessionStorage.getItem(greetingKey)===value.id)return
    stopOpening();setOpeningNeedsPlay(true)
    const speech=new SpeechSynthesisUtterance(nurseGreetingText(value.turns[0].text, 0));speech.lang='zh-CN'
    speech.onstart=()=>{sessionStorage.setItem(greetingKey,value.id);if(active())setOpeningNeedsPlay(false)}
    speech.onend=()=>{opening.current=undefined}
    speech.onerror=()=>{opening.current=undefined;if(active())setOpeningNeedsPlay(sessionStorage.getItem(greetingKey)!==value.id)}
    opening.current=speech;window.speechSynthesis.speak(speech)
  }
  const pendingKey = `hoooho-nurse-pending:${identity.current}:${memberId}:${scope}`
  const stash = () => { if (active()) { sessionStorage.setItem(pendingKey, JSON.stringify(pending.current)); setPendingCount(pending.current.length) } }
  const active = () => mounted.current && useAppStore.getState().currentMemberId === memberId && useAppStore.getState().authUser?.id === identity.current
  const accept = (value: NurseDraft) => { draftRef.current = value; if (active()) { pending.current=pending.current.filter(turn=>!value.turns.some(saved=>saved.id===turn.id));stash();setDraft(value) } }
  const pause = () => { stopOpening(); rtc.current?.stop(); rtc.current = undefined; setPreview(''); if (active()) setState('paused') }
  useEffect(() => {
    mounted.current = true; const abort = new AbortController()
    try { pending.current = JSON.parse(sessionStorage.getItem(pendingKey) || '[]'); setPendingCount(pending.current.length) } catch { pending.current = [] }
    void nurseApi.open(memberId, token, scope, abort.signal).then(async value => { if (active()){const next=await nurseApi.change(memberId,token,value,{formContext},abort.signal);if(active()){accept(next);playOpening(next)}} }).catch(e => { if (active() && e.name !== 'AbortError') setError(e.message) })
    const hidden = () => { if (document.hidden) pause() }, exit = () => pause(), offline=()=>{pause();setState('disconnected');setError('连接中断，已有文字仍在。中断后未上传的内容，请重连后重新说。')}
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', exit); window.addEventListener('offline', offline)
    const unsubscribe = useAppStore.subscribe(current => { if (current.currentMemberId !== memberId || current.authUser?.id !== identity.current) { stopOpening();rtc.current?.stop(); controller.current?.abort(); mounted.current = false; pending.current = []; setDraft(undefined); setPreview(''); setInput('') } })
    return () => { stopOpening();rtc.current?.stop(); mounted.current = false; abort.abort(); controller.current?.abort(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', exit); window.removeEventListener('offline', offline); unsubscribe() }
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
    busy.current = true; setError(''); setState('processing'); const unsynced = pending.current.map(t => t.text)
    try { accept(await nurseApi.get(memberId, token, draftRef.current.id)); for (const turn of [...pending.current]) { await append(turn); if (draftRef.current?.turns.some(t => t.id === turn.id)) { pending.current = pending.current.filter(t => t.id !== turn.id); stash() } } setInput(current => unsynced.includes(current.trim()) ? '' : current); setState('idle') }
    catch (e) { setError(e instanceof Error ? e.message : '同步失败，原话保留'); setState('error') }
    finally { busy.current = false }
  }
  const organize = async () => {
    if (busy.current || !draftRef.current) return
    busy.current = true; setError(''); stopOpening();rtc.current?.stop(); await rtc.current?.drain(); rtc.current = undefined
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
  const send = async () => {
    if (!input.trim() || busy.current || pending.current.length || !draftRef.current || rtc.current) return
    busy.current = true; setError('');stopOpening(); setState('processing')
    const text = input.trim(); setInput(''); const abort = new AbortController(); controller.current = abort
    const turn: NurseTurn = { id: crypto.randomUUID(), role: 'user', text, at: new Date().toISOString(), order: 0, final: true, status: 'completed' }
    queueFinal(turn)
    try {
      await sequence.current
      if (!active() || abort.signal.aborted) return
      await append(turn)
      const next = await nurseApi.generate(memberId, token, draftRef.current!, false, abort.signal)
      if (!active()) return
      accept(next); setState(next.emergency ? 'paused' : 'idle')
      if (next.emergency) pause()
      else if (next.organizeSuggested) { busy.current = false; await organize() }
    } catch (e) { if (active()) { setError(e instanceof Error ? e.message : '本轮未成功，原话保留'); setState('error'); if (pending.current.length) setInput(current => current || text) } }
    finally { busy.current = false }
  }
  const queueFinal = (turn: NurseTurn) => { if(active()&&!draftRef.current?.turns.some(t=>t.id===turn.id)&&!pending.current.some(t=>t.id===turn.id)){pending.current.push(turn);stash()} }
  const start = () => {
    if (!draftRef.current || busy.current || pending.current.length || rtc.current) return
    setError('');stopOpening()
    const transport = new RealtimeNurse({ queued:queueFinal, playbackBlocked: blocked => { if (active()) setPlaybackBlocked(blocked) }, memberId, token, draftId: draftRef.current.id, state: value => { if (active()) setState(value) }, error: value => { if (active()) { rtc.current = undefined; setError(value) } }, preview: value => { if (active()) setPreview(value) }, usage: (responseId, usage) => { if (responseId) void nurseApi.usage(memberId, token, draftRef.current!.id, responseId, usage).catch(() => undefined) },
      turn: turn => { const work = sequence.current.then(async () => { await append(turn); if (turn.role === 'user') { const result = await nurseApi.assess(memberId, token, draftRef.current!); if (!active()) return; accept(result); if (result.emergency) { pause(); setError('请先立即联系当地急救或就近急诊，记录可以稍后补充。') } else if (result.organizeSuggested) { busy.current = false; void organize() } } }); sequence.current = work.catch(() => undefined); return work }
    })
    rtc.current = transport; void transport.start()
  }
  const switchMode = async (next: 'voice' | 'text') => {
    const current = rtc.current
    pause(); setMode(next)
    await current?.drain(); await sequence.current
  }
  useEffect(() => { if (mode === 'text') inputRef.current?.focus() }, [mode])
  useEffect(() => {
    const body = conversationRef.current?.closest('.hoho-bottom-sheet__body')
    if (body) body.scrollTop = body.scrollHeight
  }, [draft?.turns.length, pendingCount, preview])
  useEffect(() => {
    if (!draft || entryHandled.current) return
    entryHandled.current = true
    if (initialMode === 'voice' && !pending.current.length) start()
    else if (initialMode === 'text') inputRef.current?.focus()
  }, [draft?.id, initialMode])
  const close = () => { pause(); controller.current?.abort(); onPaused(); onClose() }
  const voiceLabel = playbackBlocked ? '播放回复并继续语音' : rtc.current ? state === 'connecting' ? '取消连接' : '暂停语音' : state === 'error' || state === 'disconnected' ? '重新连接' : ['paused', 'listening', 'speaking'].includes(state) || draft?.turns.some(turn => turn.role === 'user') ? '继续语音' : '开始语音'
  const composer=<>
    {pendingCount > 0 && <div role="alert"><p>{pendingCount} 段原话尚未同步，保留在当前账号的本次页面草稿中。</p><HohoButton variant="secondary" onClick={() => void retrySync()} disabled={busy.current}>重试同步原话</HohoButton></div>}
    {['connecting','processing','organizing','saving'].includes(state) && <p className="nurse-input-status" role="status">{states[state]}</p>}
    {mode === 'voice' ? <div className="nurse-voice-compose">
      <div className="nurse-footer-actions"><HohoButton variant="secondary" onClick={() => void organize()} disabled={busy.current || !draft}>整理到表单</HohoButton><HohoButton variant="ghost" onClick={() => void switchMode('text')}>改用文字</HohoButton></div>
      <HohoButton className="nurse-voice-action" fullWidth size="large" onClick={playbackBlocked ? () => void rtc.current?.resumePlayback() : rtc.current ? pause : start} disabled={busy.current || !draft || pendingCount > 0}>
        {rtc.current && !playbackBlocked ? <Pause size={24} aria-hidden="true"/> : <Mic size={24} aria-hidden="true"/>}{voiceLabel}
      </HohoButton>
    </div> : <div className="nurse-text-compose">
      <label className="nurse-compose">跟护士说<textarea ref={inputRef} className="hoho-textarea" maxLength={4000} value={input} onChange={e => setInput(e.target.value)}/></label>
      <div className="nurse-footer-actions nurse-text-actions"><HohoButton variant="secondary" onClick={() => void organize()} disabled={busy.current || !draft}>整理到表单</HohoButton><HohoButton variant="ghost" onClick={() => void switchMode('voice')}>改用语音</HohoButton><HohoButton onClick={() => void send()} disabled={busy.current || pendingCount > 0 || !draft || !input.trim() || Boolean(rtc.current)}>发送</HohoButton></div>
    </div>}
  </>
  return <BottomSheetSurface label="智能记录" title="智能记录" leading={<Stethoscope size={21} aria-hidden="true"/>} dismissText="收起" open size="workspace" viewportAware className="nurse-conversation-sheet" layerClassName="symptom-input-layer" onClose={() => void close()} footer={composer}>
    {!draft && !error && <p role="status">正在恢复草稿…</p>}
    {error&&<div className="nurse-connection-error" role="alert"><p>{error}</p></div>}
    <div ref={conversationRef} className="nurse-conversation" aria-label="本次对话">{[...(draft?.turns ?? []), ...pending.current.filter(t => !draft?.turns.some(v => v.id === t.id))].map((turn, index) => <NurseMessage role={turn.role} recorderName={recorderName} interrupted={turn.status === 'interrupted'} key={turn.id}>
      <p>{turn.role === 'assistant' ? nurseGreetingText(turn.text, index) : turn.text}</p>
    </NurseMessage>)}</div>
    {openingNeedsPlay && draft && !draft.turns.some(t=>t.role==='user') && <HohoButton variant="ghost" onClick={()=>playOpening(draft)}>播放开场</HohoButton>}
    {preview && <p className="nurse-live-preview" aria-live="polite">{preview}（尚未完成）</p>}
  </BottomSheetSurface>
}

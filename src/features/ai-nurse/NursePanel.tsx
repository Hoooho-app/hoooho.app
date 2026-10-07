import type { JournalMetadata } from '../../types/journal'
import { useEffect, useRef, useState } from 'react'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { nurseApi } from './api'
import { RealtimeNurse } from './RealtimeNurse'
import type { NurseDraft, NurseFields, NurseMetadata, NurseState, NurseTurn } from './types'

const states: Record<NurseState, string> = { idle: '可用文字表达，或点击开启语音', connecting: '正在建立语音连接…', listening: '正在聆听', processing: '护士正在理解…', speaking: '护士正在回复', paused: '语音已暂停，麦克风已关闭', disconnected: '语音已断开', organizing: '正在整理，可保留草稿', reviewing: '请核对整理结果', saving: '正在保存', saved: '已保存', error: '可继续文字记录' }
export function NursePanel({ memberId, token, scope, onClose, onApply, initialReview, onDiscard }: { memberId: string; token: string; scope: string; onClose: () => void; onApply: (fields: Partial<NurseFields>, metadata: NurseMetadata, form?: JournalMetadata) => void; initialReview?: NurseDraft['review']; onDiscard: () => void }) {
  const [playbackBlocked, setPlaybackBlocked] = useState(false), [correction, setCorrection] = useState(false)
  const [draft, setDraft] = useState<NurseDraft>()
  const [state, setState] = useState<NurseState>('idle'), [error, setError] = useState(''), [input, setInput] = useState(''), [preview, setPreview] = useState('')
  const draftRef = useRef<NurseDraft>(), rtc = useRef<RealtimeNurse>(), controller = useRef<AbortController>(), mounted = useRef(true), sequence = useRef(Promise.resolve()), busy = useRef(false)
  const identity = useRef(useAppStore.getState().authUser?.id)
  const pending = useRef<NurseTurn[]>([]), [pendingCount, setPendingCount] = useState(0)
  const pendingKey = `hoooho-nurse-pending:${identity.current}:${memberId}:${scope}`
  const stash = () => { if (active()) { sessionStorage.setItem(pendingKey, JSON.stringify(pending.current)); setPendingCount(pending.current.length) } }
  const active = () => mounted.current && useAppStore.getState().currentMemberId === memberId && useAppStore.getState().authUser?.id === identity.current
  const accept = (value: NurseDraft) => { draftRef.current = value; if (active()) setDraft(value) }
  const pause = () => { rtc.current?.stop(); rtc.current = undefined; setPreview(''); if (active()) setState('paused') }
  useEffect(() => {
    mounted.current = true; const abort = new AbortController()
    try { pending.current = JSON.parse(sessionStorage.getItem(pendingKey) || '[]'); setPendingCount(pending.current.length) } catch { pending.current = [] }
    void nurseApi.open(memberId, token, scope, abort.signal).then(value => { if (active()) accept(value) }).catch(e => { if (active() && e.name !== 'AbortError') setError(e.message) })
    const hidden = () => { if (document.hidden) pause() }, exit = () => pause()
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', exit); window.addEventListener('offline', exit)
    const unsubscribe = useAppStore.subscribe(current => { if (current.currentMemberId !== memberId || current.authUser?.id !== identity.current) { rtc.current?.stop(); controller.current?.abort(); mounted.current = false; pending.current = []; setDraft(undefined); setPreview(''); setInput('') } })
    return () => { rtc.current?.stop(); mounted.current = false; abort.abort(); controller.current?.abort(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', exit); window.removeEventListener('offline', exit); unsubscribe() }
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
  const discard = async () => {
    if (!draftRef.current || busy.current || !window.confirm('明确放弃这份未保存草稿？已保存的记录不会删除。')) return
    const current = rtc.current; pause(); controller.current?.abort(); await current?.drain(); await sequence.current
    busy.current = true
    try { const latest = await nurseApi.get(memberId, token, draftRef.current.id); await nurseApi.change(memberId, token, latest, { discard: true }); sessionStorage.removeItem(pendingKey); pending.current = []; onDiscard(); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : '放弃未成功，草稿保留') }
    finally { busy.current = false }
  }
  const organize = async () => {
    if (busy.current || !draftRef.current) return
    busy.current = true; setError(''); rtc.current?.stop(); await rtc.current?.drain(); rtc.current = undefined
    await sequence.current
    if (pending.current.length) { setError('还有原话尚未同步，请先重试同步'); busy.current = false; return }
    const current = draftRef.current!
    if (!current.turns.some(t => t.role === 'user')) { setError('请先说出或填写本次情况'); busy.current = false; return }
    setState('organizing'); const abort = new AbortController(); controller.current = abort
    try {
      if (initialReview) accept(await nurseApi.change(memberId, token, current, { review: { ...initialReview, metadata: { ...initialReview.metadata, turns: current.turns } } }, abort.signal))
      const result = await nurseApi.generate(memberId, token, draftRef.current!, true, abort.signal)
      if (!active()) return
      accept(result)
      if (result.emergency) { setError('请先立即联系当地急救或就近急诊，记录可以稍后补充。'); setState('paused'); return }
      setState('reviewing'); onApply(result.fields, { version: 'nurse-v1', fieldSources: result.fieldSources, draftId: result.id, turns: result.turns, professionalNotes: result.notes, snapshots: result.snapshots }, result.review?.form); onClose()
    } catch (e) { if (active()) { setError(e instanceof Error ? e.message : '整理失败，原话保留'); setState('error') } }
    finally { busy.current = false }
  }
  const send = async () => {
    if (!input.trim() || busy.current || pending.current.length || !draftRef.current || rtc.current) return
    busy.current = true; setError(''); setState('processing')
    const text = input.trim(); setInput(''); const abort = new AbortController(); controller.current = abort
    try {
      await append({ id: crypto.randomUUID(), role: 'user', text, at: new Date().toISOString(), order: 0, final: true, status: 'completed', ...(correction && draftRef.current?.turns.some(t => t.role === 'user') ? { correctsTurnId: draftRef.current.turns.filter(t => t.role === 'user').at(-1)!.id } : {}) }); setCorrection(false)
      const next = await nurseApi.generate(memberId, token, draftRef.current!, false, abort.signal)
      if (!active()) return
      accept(next); setState(next.emergency ? 'paused' : 'idle')
      if (next.emergency) pause()
      else if (next.organizeSuggested) { busy.current = false; await organize() }
    } catch (e) { if (active()) { setError(e instanceof Error ? e.message : '本轮未成功，原话保留'); setState('error'); if (pending.current.length) setInput(current => current || text) } }
    finally { busy.current = false }
  }
  const start = () => {
    if (!draftRef.current || busy.current || pending.current.length || rtc.current) return
    setError('')
    const transport = new RealtimeNurse({ playbackBlocked: blocked => { if (active()) setPlaybackBlocked(blocked) }, memberId, token, draftId: draftRef.current.id, state: value => { if (active()) setState(value) }, error: value => { if (active()) { rtc.current = undefined; setError(value) } }, preview: value => { if (active()) setPreview(value) }, usage: (responseId, usage) => { if (responseId) void nurseApi.usage(memberId, token, draftRef.current!.id, responseId, usage).catch(() => undefined) },
      turn: turn => { const work = sequence.current.then(async () => { await append(turn); if (turn.role === 'user') { const result = await nurseApi.assess(memberId, token, draftRef.current!); if (!active()) return; accept(result); if (result.emergency) { pause(); setError('请先立即联系当地急救或就近急诊，记录可以稍后补充。') } else if (result.organizeSuggested) { busy.current = false; void organize() } } }); sequence.current = work.catch(() => undefined); return work }
    })
    rtc.current = transport; void transport.start()
  }
  const close = async () => { const current = rtc.current; pause(); controller.current?.abort(); await current?.drain(); await sequence.current; onClose() }
  return <BottomSheetSurface label="智能症状记录" title="智能记录" open size="workspace" onClose={() => void close()} footer={<div className="nurse-controls"><HohoButton onClick={() => void organize()} disabled={busy.current || !draft} fullWidth>先整理一下</HohoButton><HohoButton variant="ghost" onClick={() => void close()}>保留草稿，返回填写</HohoButton></div>}>
    <p>正在为{useAppStore.getState().members.find(m => m.id === memberId)?.name ?? '当前孩子'}记录。整理后需要你核对，确认保存前属于草稿。</p>
    {!draft && !error && <p role="status">正在恢复草稿…</p>}
    <div className="nurse-conversation" aria-label="本次对话">{[...(draft?.turns ?? []), ...pending.current.filter(t => !draft?.turns.some(v => v.id === t.id))].map(turn => <div className={`nurse-turn nurse-turn--${turn.role}`} key={turn.id}><strong>{turn.role === 'user' ? '家长' : 'AI 护士'}</strong><p>{turn.text}</p>{turn.status === 'interrupted' && <small>回复已打断</small>}</div>)}</div>
    {pendingCount > 0 && <div role="alert"><p>{pendingCount} 段原话尚未同步，保留在当前账号的本次页面草稿中。</p><HohoButton variant="secondary" onClick={() => void retrySync()} disabled={busy.current}>重试同步原话</HohoButton></div>}
    {playbackBlocked && <HohoButton variant="secondary" onClick={() => void rtc.current?.resumePlayback()}>播放回复并继续语音</HohoButton>}
    {preview && <p aria-live="polite">{preview}（尚未完成）</p>}
    <p role="status">{states[state]}</p>{error && <p role="alert">{error}</p>}
    {draft?.organizeSuggested && <p>可以先整理已有内容，由你确认是否保存。</p>}
    {draft?.review && <HohoButton variant="secondary" onClick={() => { pause(); onApply(draft.review!.fields, draft.review!.metadata, draft.review!.form); onClose() }}>继续核对上次草稿</HohoButton>}
    <div className="nurse-controls"><HohoButton variant="secondary" onClick={rtc.current ? pause : start} disabled={busy.current || !draft}>{rtc.current ? '暂停语音' : '开启实时语音'}</HohoButton><HohoButton variant="ghost" onClick={pause}>停止回复</HohoButton></div>
    {draft?.turns.some(t => t.role === 'user') && <label><input type="checkbox" checked={correction} onChange={e => setCorrection(e.target.checked)}/>这次是更正上一条说明</label>}
    <label>跟护士说<textarea className="hoho-textarea" maxLength={4000} value={input} onChange={e => setInput(e.target.value)} /></label><HohoButton onClick={() => void send()} disabled={busy.current || pendingCount > 0 || !draft || !input.trim() || Boolean(rtc.current)}>发送</HohoButton><HohoButton variant="ghost" disabled={busy.current} onClick={() => void discard()}>放弃未保存草稿</HohoButton>
  </BottomSheetSurface>
}

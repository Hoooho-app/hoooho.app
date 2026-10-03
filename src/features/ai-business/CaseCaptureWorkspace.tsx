import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Camera, Mic, X } from 'lucide-react'
import { WebPageHeader } from '../../components/common'
import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { ChildBodyLocationPicker } from '../../components/health/body-location/ChildBodyLocationPicker'
import type { BodyLocationSelection } from '../../features/body-location'
import { useSymptomVoice } from '../../pages/HealthEvents/useSymptomVoice'
import { localDateTimeValue, localDateTimeToIso } from '../../utils/healthOccurredAt'
import { useAppStore } from '../../store/useAppStore'
import { caseService } from '../case-continuity/api'
import type { CasesData, ObservationResult } from '../case-continuity/types'
import { captureDraft, type CaptureDraft } from './captureDraft'
import './caseCapture.css'

export const fileDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('原件读取失败，请重试')); reader.readAsDataURL(blob) })
const resultChoices = [['improved', '改善'], ['unchanged', '无变化'], ['worse', '加重'], ['not_observed', '未观察']] as const
export function CaseCaptureWorkspace({ memberId, token, onClose, onSaved, initialEventId, taskId, onCaptured }: { memberId: string; token: string; onClose: () => void; onSaved?: (message: string) => void; initialEventId?: string; taskId?: string; onCaptured?: (eventId: string) => void }) {
  const accountId = useAppStore(s => s.authUser?.id ?? 'guest')
  const key = `${accountId}:${memberId}:${initialEventId ?? 'new'}:${taskId ?? ''}`
  const [draft, setDraft] = useState<CaptureDraft>(() => ({ text: '', files: [], occurredAt: localDateTimeValue(), timeUnknown: false, requestId: crypto.randomUUID(), eventId: initialEventId }))
  const [hydrated, setHydrated] = useState(false), [cases, setCases] = useState<CasesData | null>(null), [error, setError] = useState(''), [caseError, setCaseError] = useState('')
  const [saving, setSaving] = useState(false), [ownership, setOwnership] = useState(false), [chosen, setChosen] = useState(initialEventId ?? ''), [cancelVoice, setCancelVoice] = useState(false)
  const [result, setResult] = useState<ObservationResult | undefined>(), [locations, setLocations] = useState<BodyLocationSelection[]>([])
  const camera = useRef<HTMLInputElement>(null), album = useRef<HTMLInputElement>(null), pending = useRef(false), mounted = useRef(true), pointerStart = useRef<number | null>(null), gesture = useRef(false), discard = useRef(false)
  const voice = useSymptomVoice(draft.text, text => setDraft(d => ({ ...d, text })), 5000, file => { if (mounted.current) setDraft(d => ({ ...d, files: [...d.files, file] })) })
  const [recognition, setRecognition] = useState(''), [types, setTypes] = useState<string[]>([])
  const recognitionRun = useRef(0), recognitionAbort = useRef<AbortController | null>(null)
  const [height, setHeight] = useState(window.visualViewport?.height ?? window.innerHeight)
  const loadCases = () => { const controller = new AbortController(); setCaseError(''); void caseService.list(memberId, token, controller.signal).then(data => { if (!controller.signal.aborted) setCases(data) }).catch(e => { if (!controller.signal.aborted) setCaseError(e instanceof Error ? e.message : '情况列表未能加载') }); return controller }
  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    const verified = caseService.list(memberId,token,controller.signal).then(data=>{if(!controller.signal.aborted)setCases(data);return data}).catch(e=>{if(!controller.signal.aborted)setCaseError(e instanceof Error?e.message:'情况列表未加载');return null})
    void Promise.all([captureDraft(key),verified]).then(async ([local,data]) => {
      const saved = local ?? (data && !controller.signal.aborted ? await captureDraft(key,undefined,{accountId,memberId}) : null)
      if (mounted.current && !controller.signal.aborted) { if (saved) { setDraft(saved); setChosen(saved.eventId ?? ''); setResult(saved.result); setLocations(saved.locations ?? []) } setHydrated(true) }
    }).catch(() => { if (mounted.current && !controller.signal.aborted) { setError('本设备草稿读取失败，请保持页面打开后重试'); setHydrated(true) } })
    return () => { mounted.current = false; recognitionRun.current++; recognitionAbort.current?.abort(); controller.abort() }
  }, [key])
  useEffect(() => { if (hydrated) void captureDraft(key, draft).catch(() => { if (mounted.current) setError('本设备未能保存草稿，离开前请先保存记录') }) }, [draft, hydrated, key])
  useEffect(() => { const viewport = window.visualViewport; const update = () => setHeight(viewport?.height ?? window.innerHeight); viewport?.addEventListener('resize', update); return () => viewport?.removeEventListener('resize', update) }, [])
  // Photos enter the same server-side AI draft/recognize/review chain, without
  // creating a formal event or accepting a model's diagnosis or source identity.
  const recognize = async (selected: File[]) => {
    const photos = selected.filter(f => !f.type.startsWith('audio/'))
    if (!photos.length) { setTypes([]); setRecognition(''); return }
    recognitionAbort.current?.abort()
    const controller = new AbortController(), run = ++recognitionRun.current
    recognitionAbort.current = controller; setRecognition('原件保存与整理中…'); setTypes([])
    const current = () => mounted.current && run === recognitionRun.current && !controller.signal.aborted
    const url = `/api/members/${encodeURIComponent(memberId)}/ai-drafts`
    type ServerDraft = { id: string; version: number; state: string; items: { category: string; title: string }[] }
    const request = async (input: unknown) => {
      const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify(input) })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error?.message ?? '识别未完成')
      return value as ServerDraft
    }
    try {
      const original = await request({ text: draft.text, task:'record', sourceIdentity:'pending', deferRecognition:true, ...(initialEventId ? {eventId:initialEventId} : {}), files:await Promise.all(photos.map(async f => ({name:f.name,mimeType:f.type,dataUrl:await fileDataUrl(f)}))) })
      if (!current()) return
      setDraft(d => ({...d,aiDraftId:original.id})); setRecognition('原件已保存，正在生成待确认类型…')
      const prepared = await request({ id:original.id, version:original.version, text:draft.text, task:'record', sourceIdentity:'pending' })
      if (current()) { setTypes(prepared.items.map(item => item.title)); setRecognition('类型草稿待确认；保存原件后可在详情核对或改类型') }
    } catch (e) { if (current()) setRecognition(`待确认：${e instanceof Error ? e.message : '识别未完成'}。仍可先保存原件，再手动整理。`) }
  }
  useEffect(() => { const hide = () => { if (document.hidden) { gesture.current = false; pointerStart.current = null; setCancelVoice(false); voice.stop() } }; document.addEventListener('visibilitychange', hide); return () => document.removeEventListener('visibilitychange', hide) }, [voice.stop])
  const openOwnership = () => { gesture.current = false; voice.stop(); setCancelVoice(false); pointerStart.current = null; setOwnership(true) }
  const chooseFiles = (files: FileList | null) => { if (!files?.length) return; const selected = [...draft.files, ...Array.from(files)]; if (selected.length > 12 || selected.reduce((n, f) => n + f.size, 0) > 15 * 1024 * 1024) { setError('最多12份原件，总大小15 MB'); return } setDraft(d => ({ ...d, files: selected, aiDraftId: undefined })); setError(''); void recognize(selected) }
  const save = async () => {
    if (pending.current || !hydrated) return
    if (chosen && !cases?.active.some(c => c.event.id === chosen)) { setError('请选择当前人物的情况，或新的一次情况'); return }
    const occurredAt = draft.timeUnknown ? new Date().toISOString() : localDateTimeToIso(draft.occurredAt)
    if (!occurredAt || Date.parse(occurredAt) > Date.now()) { setError('记录时间不能晚于现在'); return }
    if (taskId && !result) { setError('请选择本次实际观察结果'); return }
    recognitionRun.current++; recognitionAbort.current?.abort(); pending.current = true; setSaving(true); setError(''); voice.stop()
    try {
      const files = await Promise.all(draft.files.map(async file => ({ name: file.name, mimeType: file.type, dataUrl: await fileDataUrl(file) })))
      const response = await caseService.capture(memberId, token, { text: draft.text, files, aiDraftId: draft.aiDraftId, identity: draft.files.some(f => !f.type.startsWith('audio/')) ? 'pending' : 'parent', requestId: draft.requestId, occurredAt, timeUnknown: draft.timeUnknown, supplement: draft.supplement, bodyLocations: draft.bodyLocations, ...(chosen ? { eventId: chosen } : {}), ...(taskId && chosen === initialEventId ? { taskId, result } : {}) })
      await captureDraft(key, null)
      if (!mounted.current || useAppStore.getState().currentMemberId !== memberId) return
      onSaved?.('已保存，原话与原件已保留'); if (onCaptured) onCaptured(response.eventId); else onClose()
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '保存未完成，草稿保留，请重试') } finally { pending.current = false; if (mounted.current) setSaving(false) }
  }
  const release = (discard: boolean) => { if (!gesture.current) return; gesture.current = false; discard ? voice.discardSegment() : voice.stop(); pointerStart.current = null; setCancelVoice(false) }
  return <section className="case-capture-workspace" style={{ '--capture-height': `${height}px` } as CSSProperties} aria-label="智能记录">
    <WebPageHeader title="智能记录" onBack={() => { release(false); onClose() }} action={<HohoButton variant="text" size="small" disabled={saving || !hydrated || (!draft.text.trim() && !draft.files.length)} onClick={openOwnership}>先保存</HohoButton>} />
    <div className="case-capture-body">
      {!hydrated && <p role="status">正在读取当前人物的草稿…</p>}
      <label className="case-narrative"><strong>发生了什么（主诉）？</strong><textarea aria-label="发生了什么（主诉）？" value={draft.text} maxLength={5000} placeholder="用自己的话记下来" onChange={e => setDraft(d => ({ ...d, text: e.target.value }))} disabled={saving || !hydrated} /></label>
      {recognition && <p role="status">{recognition}{types.length > 0 && <span> · {types.join('、')}</span>}</p>}
      {taskId && <fieldset className="case-observation-choice"><legend>这次实际观察到什么？</legend>{resultChoices.map(([value, label]) => <button type="button" disabled={saving || !hydrated} aria-pressed={result === value} key={value} onClick={() => { setResult(value); setDraft(d => ({...d,result:value})) }}>{label}</button>)}</fieldset>}
      {!!draft.files.length && <div className="case-attachments">{draft.files.map((file, index) => <span key={`${file.name}:${index}`}>{file.name}<button aria-label={`移除原件${index + 1}`} onClick={() => { recognitionRun.current++; recognitionAbort.current?.abort(); setTypes([]); setRecognition('原件已变更，类型待确认'); setDraft(d => ({ ...d, aiDraftId:undefined, files: d.files.filter((_, i) => i !== index) })) }}><X size={16}/></button></span>)}</div>}
      <details className="case-supplements"><summary>再补充一点（选填）</summary><ChildBodyLocationPicker memberId={memberId} value={locations} onChange={values => { setLocations(values); setDraft(d => ({ ...d, locations: values, bodyLocations: values.map(v => v.label) })) }} /><label>程度、触发或变化<input disabled={saving || !hydrated} value={draft.supplement ?? ''} maxLength={1000} placeholder="不确定可以不填" onChange={e => setDraft(d => ({ ...d, supplement: e.target.value }))}/></label><button type="button" disabled={saving || !hydrated} onClick={() => album.current?.click()}>从相册选择／上传资料</button></details>
      <label className="case-time">记录时间<input type="datetime-local" max={localDateTimeValue()} value={draft.occurredAt} disabled={draft.timeUnknown || saving || !hydrated} onChange={e => setDraft(d => ({ ...d, occurredAt: e.target.value }))}/></label>
      <label className="case-time-unknown"><input type="checkbox" disabled={saving || !hydrated} checked={draft.timeUnknown} onChange={e => setDraft(d => ({ ...d, timeUnknown: e.target.checked }))}/>发生时间不确定</label>
      {(error || voice.error) && <StatusNotice tone="error" title="暂未完成">{error || voice.error}</StatusNotice>}
      {voice.busy && <p className="case-voice-status" role="status">{cancelVoice ? '松手取消本段，之前的内容保留' : voice.state === 'requesting' ? '正在开启麦克风…' : voice.state === 'stopping' ? '已停止收音，正在确认本段' : voice.partial ? '实时转写（本段暂定），松手确认' : '本段已识别，继续说或松手停止'}</p>}
    </div>
    <footer className="case-input-tools"><div><button className="case-camera" aria-label="拍照" disabled={saving || !hydrated} onClick={() => { release(false); camera.current?.click() }}><Camera size={23}/><span>拍照</span></button><button className={`case-hold-voice${voice.busy ? ' is-listening' : ''}${cancelVoice ? ' is-cancelling' : ''}`} disabled={saving || !hydrated || voice.state === 'stopping'} onPointerDown={e => { if (e.button !== 0 || gesture.current) return; e.preventDefault(); discard.current = false; gesture.current = true; pointerStart.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); void voice.start() }} onPointerMove={e => { if (pointerStart.current !== null) { discard.current = pointerStart.current - e.clientY > 55; setCancelVoice(discard.current) } }} onPointerUp={() => release(discard.current)} onPointerCancel={() => release(true)} onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); gesture.current = true; void voice.start() } if (e.key === 'Escape') release(true) }} onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(false) } }}><Mic size={20}/>{cancelVoice ? '松手取消本段' : voice.busy ? '正在听…' : '按住说话'}</button></div><p>边说边记，松手停止，上滑取消本段</p></footer>
    <input type="file" ref={camera} accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={e => { chooseFiles(e.target.files); e.currentTarget.value = '' }}/><input type="file" ref={album} accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden onChange={e => { chooseFiles(e.target.files); e.currentTarget.value = '' }}/>
    {ownership && <BottomSheetSurface open label="这条记录放在哪里" title="这条记录放在哪里" onClose={() => { if (!saving) setOwnership(false) }} footer={<HohoButton fullWidth loading={saving} disabled={saving || voice.busy || voice.audioPending || (chosen !== '' && !cases)} onClick={() => void save()}>确认保存</HohoButton>}><div className="case-ownership"><p>由你选择，不自动合并</p><label><input type="radio" name="case-link" checked={chosen !== ''} disabled={!cases?.active.length || !!taskId} onChange={() => { const id = initialEventId ?? cases?.active[0]?.event.id ?? ''; setChosen(id); setDraft(d => ({...d,eventId:id})) }}/>接着这次记</label>{chosen !== '' && <select aria-label="选择这次情况" value={chosen} disabled={!!taskId || saving} onChange={e => { setChosen(e.target.value); setDraft(d => ({...d,eventId:e.target.value})) }}>{cases?.active.map(c => <option key={c.event.id} value={c.event.id}>{c.event.title}</option>)}</select>}<label><input type="radio" name="case-link" checked={chosen === ''} disabled={!!taskId} onChange={() => { setChosen(''); setDraft(d => ({...d,eventId:''})) }}/>新的一次情况</label>{caseError && <StatusNotice tone="error" title="情况列表未加载">{caseError}<HohoButton variant="text" onClick={loadCases}>重试</HohoButton></StatusNotice>}{error && <p role="alert">{error}</p>}</div></BottomSheetSurface>}
  </section>
}

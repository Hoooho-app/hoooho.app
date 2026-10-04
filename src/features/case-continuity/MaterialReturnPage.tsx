import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { HohoButton } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { healthEventRecordService } from '../../services/healthEventRecords'
import { AIBusinessComposer } from '../ai-business/AIBusinessComposer'
import { RecordOriginals } from '../ai-business/RecordOriginals'
import { fileDataUrl } from '../ai-business/CaseCaptureWorkspace'
import { captureDraft } from '../ai-business/captureDraft'
import { identityLabels } from './CaseActions'
import { caseService } from './api'
import { useCases } from './useCases'
import type { MaterialIdentity } from './types'
import type { HealthEventRecordApiDto } from '../../types'
import './cases.css'
import { localDateTimeToIso, localDateTimeValue } from '../../utils/healthOccurredAt'
export function MaterialReturnPage() {
  const { eventId = '' } = useParams(), [query] = useSearchParams()
  return <MaterialReturnForm eventId={eventId} initialRecordId={query.get('recordId')} />
}
export function MaterialReturnForm({ eventId, initialRecordId = null, embedded = false, onSaved, onClose, onDirtyChange }: { eventId: string; initialRecordId?: string | null; embedded?: boolean; onSaved?: () => void; onClose?: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const navigate = useNavigate(), { memberId, token, data, error, reload } = useCases()
  const accountId = useAppStore(s => s.authUser?.id ?? 'guest'), initialMember = useRef(memberId), pending = useRef(false), alive = useRef(true)
  const [identity, setIdentity] = useState<MaterialIdentity>('pending'), [text, setText] = useState(''), [files, setFiles] = useState<File[]>([]), [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [notice, setNotice] = useState(''), [record, setRecord] = useState<HealthEventRecordApiDto | null>(null), [review, setReview] = useState(false), [confirmed, setConfirmed] = useState(false), [hydrated, setHydrated] = useState(false)
  const requestId = useRef<string>(crypto.randomUUID()), key = `return:${accountId}:${memberId}:${eventId}`, input = useRef<HTMLInputElement>(null)
  const [inlineRecordId, setInlineRecordId] = useState<string | null>(null)
  const recordId = embedded ? inlineRecordId||initialRecordId : initialRecordId, latestToken = useRef(token)
  const [occurredAt, setOccurredAt] = useState(''), [timeUnknown, setTimeUnknown] = useState(true)
  latestToken.current = token
  const [hydrationRetry, setHydrationRetry] = useState(0)
  const item = [...(data?.active ?? []), ...(data?.archived ?? [])].find(c => c.event.id === eventId)
  useEffect(() => {
    alive.current = true
    const controller = new AbortController(), requestToken = latestToken.current
    setHydrated(false); setConfirmed(false); setFailure('')
    void (async () => {
      await caseService.list(memberId, requestToken, controller.signal)
      if (recordId) {
        const records = await healthEventRecordService.list(eventId, requestToken, controller.signal)
        if (controller.signal.aborted) return
        const source = records.find(r => r.id === recordId)
        if (!source?.caseContext) throw new Error('未找到该资料')
        const edited=await captureDraft(`${key}:${recordId}`)
        if(controller.signal.aborted)return
        setRecord(source); setText(edited?.text??source.content); setIdentity(edited?.identity??source.caseContext.identity)
      } else {
        const saved = await captureDraft(key, undefined, {accountId, memberId})
        if (controller.signal.aborted) return
        setRecord(null)
        if (saved) { setText(saved.text); setFiles(saved.files); setOccurredAt(saved.occurredAt); setTimeUnknown(saved.timeUnknown); setIdentity(saved.identity ?? 'pending'); requestId.current = saved.requestId }
      }
      setHydrated(true)
    })().catch(e => { if (!controller.signal.aborted) { setFailure(e instanceof Error ? e.message : '资料未加载'); if (!recordId) setHydrated(true) } })
    return () => { alive.current = false; controller.abort() }
    // A renewed token for the same account/member must not rehydrate over edits.
  }, [key, eventId, recordId, hydrationRetry])
  useEffect(() => { if (hydrated && !record && !recordId) void captureDraft(key, { text, files, occurredAt, timeUnknown, identity, requestId: requestId.current, eventId }).catch(() => setFailure('设备草稿未保存，离开前请先保留原件')) }, [text, files, occurredAt, timeUnknown, identity, hydrated, record, recordId, key, eventId])
  const recordEdited=Boolean(record&&(text!==record.content||identity!==record.caseContext?.identity))
  useEffect(()=>{if(hydrated&&record&&recordId&&recordEdited)void captureDraft(`${key}:${recordId}`,{text,identity,files:[],occurredAt:'',timeUnknown:true,requestId:recordId,eventId}).catch(()=>setFailure('校对草稿未保存，离开前请保留文字'))},[hydrated,record,recordId,recordEdited,key,text,identity,eventId])
  useEffect(() => { onDirtyChange?.(busy || review || recordEdited || (!record && Boolean(text.trim() || files.length || occurredAt))); return () => onDirtyChange?.(false) }, [busy, review, record, recordEdited, text, files, occurredAt, onDirtyChange])
  useEffect(() => { if (memberId !== initialMember.current) navigate('/cases', { replace: true }) }, [memberId, navigate])
  async function originals() {
    if (pending.current || !hydrated || !item || item.event.caseArchivedAt) return
    pending.current = true; setBusy(true); setFailure('')
    try { const instant = timeUnknown ? new Date().toISOString() : localDateTimeToIso(occurredAt); if (!timeUnknown && (!instant || Date.parse(instant) > Date.now())) throw new Error('请选择不晚于现在的就诊时间'); const result = await caseService.capture(memberId, token, { eventId, requestId: requestId.current, text, files: await Promise.all(files.map(async f => ({ name: f.name, mimeType: f.type, dataUrl: await fileDataUrl(f) }))), identity, timeUnknown, occurredAt: instant }); await captureDraft(key, null); if (!alive.current) return; if (embedded) { setInlineRecordId(result.recordId); setNotice('原件已保存到这次情况；内容尚未识别或核对'); onSaved?.() } else navigate(`?recordId=${result.recordId}`, { replace: true }) } catch (e) { if (alive.current) setFailure(e instanceof Error ? e.message : '原件未保存，保留本页重试') } finally { pending.current = false; if (alive.current) setBusy(false) }
  }
  async function confirm() {
    if (!record || !hydrated || pending.current || memberId !== initialMember.current) return
    pending.current = true; setBusy(true); setFailure('')
    try { await caseService.confirm(memberId, token, eventId, record.id, { content: text, identity, confirmed }); await captureDraft(`${key}:${record.id}`,null); if (alive.current) { if (embedded) { setNotice('已核对并接回这次情况'); onSaved?.(); onClose?.() } else navigate(`/health-events/${eventId}`, { replace: true }) } } catch (e) { if (alive.current) setFailure(e instanceof Error ? e.message : '核对未保存，请重试') } finally { pending.current = false; if (alive.current) setBusy(false) }
  }
  async function intelligentReview() {
    if (!record || !hydrated || pending.current) return
    pending.current = true; setBusy(true); setFailure('')
    try { const originals = await Promise.all(record.caseContext!.attachmentIds.map(async id => { const response = await fetch(`/api/events/${eventId}/attachments/${id}/content`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error('原件暂不可用，请重试'); const blob = await response.blob(); return new File([blob], `资料原件.${blob.type === 'application/pdf' ? 'pdf' : 'png'}`, { type: blob.type }) })); if (alive.current) { setFiles(originals); setReview(true) } } catch (e) { if (alive.current) setFailure(e instanceof Error ? e.message : '原件未加载') } finally { pending.current = false; if (alive.current) setBusy(false) }
  }
  const content = <>
    {error ? <p role="alert">{error}<HohoButton onClick={reload}>重试加载情况</HohoButton></p> : !data ? <p>加载中…</p> : !item ? <p>未找到当前人物的情况</p> : <div className="continuity-form" aria-label="添加这次就诊的资料">
      {embedded ? <h3>添加这次就诊的资料</h3> : <p>关联：{item.event.title}</p>}
      <label>资料来源<select aria-label="资料来源" disabled={busy || !hydrated} value={identity} onChange={e => setIdentity(e.target.value as MaterialIdentity)}>{Object.entries(identityLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>{record ? '整理出的草稿（核对后接回）' : '资料原话或补充（选填）'}<textarea value={text} maxLength={5000} onChange={e => setText(e.target.value)} disabled={busy || !hydrated}/></label>
      {record ? <>
        <RecordOriginals eventId={eventId} attachmentIds={record.caseContext!.attachmentIds}/>
        <HohoButton variant="secondary" disabled={busy || !hydrated} onClick={() => void intelligentReview()}>智能整理原件</HohoButton>
        <small>日期、诊断、观察期限未提供时保持未知。AI内容核对后才保存，不将推断当作诊断。</small>
        <label><span><input disabled={busy || !hydrated} style={{ width:'auto' }} type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/> 已核对来源和原件，未知信息没有补猜</span></label>
        <HohoButton disabled={busy || !hydrated || !confirmed || identity === 'pending'} loading={busy} onClick={() => void confirm()}>确认接回这次情况</HohoButton>
      </> : <>
        <label>就诊时间<input type="datetime-local" value={occurredAt} max={localDateTimeValue()} disabled={busy || !hydrated} onChange={e => { setOccurredAt(e.target.value); setTimeUnknown(!e.target.value) }}/></label>
        <label><span><input style={{ width:'auto' }} type="checkbox" checked={timeUnknown} disabled={busy || !hydrated} onChange={e => setTimeUnknown(e.target.checked)}/>就诊时间未提供</span></label>
        <HohoButton variant="secondary" disabled={busy || !hydrated} onClick={() => input.current?.click()}>添加截图／报告（可多页）</HohoButton>
        <input aria-label="上传就诊资料" ref={input} hidden multiple type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy || !hydrated} onChange={e => { const chosen=Array.from(e.currentTarget.files??[]); setFiles(old => [...old, ...chosen]); e.currentTarget.value = '' }}/>
        {files.map((file,index) => <p key={index}>{file.name}<HohoButton variant="text" disabled={busy} onClick={() => setFiles(old => old.filter((_, i) => i !== index))}>移除</HohoButton></p>)}
        <small>支持照片与PDF；原件先保存，识别与人工核对另行确认。识别失败不影响原件保留。</small>
        <HohoButton disabled={busy || !hydrated || (!files.length && !text.trim())} loading={busy} onClick={() => void originals()}>{embedded ? '保存到这次情况' : '先保留原件'}</HohoButton>
      </>}
      {busy && <p role="status">正在上传／保存，请稍候…</p>}{failure && <p role="alert">{failure}</p>}
      {recordId && !hydrated && !failure && <p role="status">资料加载中…</p>}
      {recordId && !hydrated && failure && <HohoButton onClick={() => setHydrationRetry(n => n + 1)}>重试加载资料</HohoButton>}
      {notice && <p role="status">{notice}</p>}
      {embedded && <HohoButton variant="secondary" disabled={busy || review} onClick={() => { if (record || (!text.trim() && !files.length && !occurredAt) || window.confirm('资料尚未保存，取消后保留设备草稿，确定退出吗？')) onClose?.() }}>{record ? '关闭资料区域' : '取消'}</HohoButton>}
    </div>}
    {review && <AIBusinessComposer key={`${memberId}:${record?.id}`} embedded={embedded} sourceRecordId={record?.id} structuredReview initialDraftId={record?.caseContext?.aiDraftId} initialTask="report" memberId={memberId} token={token} eventId={eventId} sourceIdentity={identity} initialText={text} initialFiles={files} onClose={() => setReview(false)} onSaved={() => { setNotice('整理结果已保存到这次情况，原件与来源保持可查'); onSaved?.(); reload() }}/>}</>
  return embedded ? <section className="case-inline-materials">{content}</section> : <main className="app-shell continuity-page"><WebPageHeader title="带回问诊资料"/><div className="continuity-scroll">{content}</div></main>
}

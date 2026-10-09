import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { HohoButton, StatusNotice } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { SymptomCaseRecord } from './SymptomCaseRecord'
import { SmartRecordWorkspace } from '../ai-business/SmartRecordWorkspace'
import { CaseFollowupCard } from './CaseFollowupCard'
import { useCases } from './useCases'
import { caseService } from './api'
import './cases.css'
import { ObservationSource, type SourceChoice } from './ObservationSource'
import { ComparisonRecords } from './ComparisonRecords'
export function SmartCaseRecordPage() {
  const memberId = useAppStore(s => s.currentMemberId), token = useAppStore(s => s.authToken) ?? '', navigate = useNavigate(), [query] = useSearchParams()
  const accountId = useAppStore(s => s.authUser?.id ?? '')
  const location = useLocation()
  const [homeEntry] = useState(() => (location.state as { homeNurseEntry?: { mode?: string; memberId?: string; accountId?: string } } | null)?.homeNurseEntry)
  const entryIdentityChanged = useRef(false)
  if (homeEntry && (homeEntry.memberId !== memberId || homeEntry.accountId !== accountId)) entryIdentityChanged.current = true
  const initialNurseMode = !entryIdentityChanged.current && homeEntry?.memberId === memberId && homeEntry.accountId === accountId
    && !query.get('eventId') && !query.get('taskId') && (homeEntry.mode === 'voice' || homeEntry.mode === 'text')
    ? homeEntry.mode : undefined
  // Consume the explicit entry intent. Refresh/back must never restart a microphone.
  useEffect(() => {
    if ((location.state as { homeNurseEntry?: unknown } | null)?.homeNurseEntry) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
    }
  }, [location.pathname, location.search, location.state, navigate])
  return <main className="app-shell continuity-page">{query.get('taskId') ? <SymptomCaseRecord key={`${accountId}:${memberId}:${query}`} initialNurseMode={initialNurseMode} accountId={accountId} memberId={memberId} token={token} eventId={query.get('eventId') ?? undefined} taskId={query.get('taskId') ?? undefined} onClose={() => navigate(-1)} onCaptured={id => navigate(`/health-events/${id}`, { replace: true })}/> : <SmartRecordWorkspace key={`${accountId}:${memberId}:${query}`} memberId={memberId} token={token} eventId={query.get('eventId')??undefined} onClose={()=>navigate(-1)} onCaptured={id=>navigate(`/health-events/${id}`,{replace:true})}/>}</main>
}
export function CaseListPage() {
  const { data, error, reload, memberId, token } = useCases(), [query] = useSearchParams(), [archived, setArchived] = useState(query.get('state') === 'archived')
  const navigate=useNavigate(),dirty=useRef(new Map<string,boolean>())
  const [feedback,setFeedback]=useState<string|null>(null)
  const accountId=useAppStore(s=>s.authUser?.id??'')
  const onDirty=useCallback((id:string,value:boolean)=>{dirty.current.set(id,value)},[])
  const guard=()=>![...dirty.current.values()].some(Boolean)||window.confirm('有内容尚未保存，离开后保留设备草稿，确定继续吗？')
  useEffect(()=>{setFeedback(null);dirty.current.clear()},[accountId,memberId])
  useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if([...dirty.current.values()].some(Boolean)){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before)},[])
  const items = archived ? data?.archived : data?.active
  return <main className="app-shell continuity-page case-followup-page"><WebPageHeader title="情况跟进" onBack={()=>{if(guard())navigate(-1)}}/><div className="continuity-scroll"><div className="continuity-tabs" role="tablist" aria-label="情况状态"><button role="tab" aria-selected={!archived} aria-pressed={!archived} onClick={() => {if(guard())setArchived(false)}}>跟进中{data ? ` ${data.active.length}` : ''}</button><button role="tab" aria-selected={archived} aria-pressed={archived} onClick={() => {if(guard())setArchived(true)}}>已归档{data ? ` ${data.archived.length}` : ''}</button></div>
    {feedback&&<div role="status" className="case-followup-feedback">{feedback}</div>}
    {error&&<StatusNotice tone="error" title="列表未加载">{error}<HohoButton onClick={reload}>重试</HohoButton></StatusNotice>}
    {!items ? !error&&<p role="status">正在加载…</p> : !items.length ? <p className="continuity-empty">暂无{archived ? '归档' : '跟进中'}的情况</p> : items.slice().sort((a,b)=>Number(b.event.id===query.get('eventId'))-Number(a.event.id===query.get('eventId'))).map(item => <CaseFollowupCard key={`${accountId}:${memberId}:${item.event.id}`} item={item} memberId={memberId} token={token} timezone={data!.timezone} reload={reload} onDirty={onDirty} onStatus={archived=>setFeedback(archived?'已结束跟进并归档':'已恢复跟进')}/>)}
  </div></main>
}
export function CaseComparePage() {
  const { data, error, reload } = useCases(), [first, setFirst] = useState(''), [second, setSecond] = useState('')
  const items = [...(data?.active ?? []), ...(data?.archived ?? [])]
  return <main className="app-shell continuity-page"><WebPageHeader title="对比两次情况"/><div className="continuity-scroll"><p>只比较已记录的事实，不推断原因或风险。</p>{error ? <HohoButton onClick={reload}>重新加载</HohoButton> : !data ? <p>加载中…</p> : <><div className="continuity-form">{[[first, setFirst], [second, setSecond]].map(([value, change], index) => <label key={index}>第{index + 1}次情况<select value={value as string} onChange={e => (change as typeof setFirst)(e.target.value)}><option value="">请选择</option>{items.filter(item => item.event.id !== (index ? first : second)).map(item => <option key={item.event.id} value={item.event.id}>{item.event.title}</option>)}</select></label>)}</div><div className="continuity-compare">{first && second && [first, second].map(id => { const item = items.find(c => c.event.id === id); return item ? <section className="continuity-card" key={id}><h2>{item.event.title}</h2><p>开始：{item.event.startTime ? new Date(item.event.startTime).toLocaleString() : '未记录'}</p><ComparisonRecords eventId={id}/><Link to={`/health-events/${id}`}>查看完整记录 ›</Link></section> : null })}</div></>}</div></main>
}
export function RetiredIndexPage() {
  return <main className="app-shell continuity-page"><WebPageHeader title="功能已停止" fallback="/nurse-station"/><div className="continuity-scroll"><p>指数功能已停止。原有记录仍然保留。</p><Link to="/health-events">查看健康随记 ›</Link><Link to="/health-profile/allergy">查看过敏与反应记录 ›</Link></div></main>
}
export function ObservationPlanPage() {
  const { eventId } = useParams(), { data, error, reload, memberId, token } = useCases(), navigate = useNavigate()
  const [query] = useSearchParams(), existingId = query.get('taskId')
  const item = [...(data?.active ?? []), ...(data?.archived ?? [])].find(c => c.event.id === eventId)
  const existing = item?.observations.find(t => t.id === existingId)
  const today = new Date().toLocaleDateString('en-CA')
  const [name, setName] = useState(''), [start, setStart] = useState(today), [end, setEnd] = useState(today), [frequency, setFrequency] = useState(1), [busy, setBusy] = useState(false), [failure, setFailure] = useState('')
  const pending = useRef(false), requestId = useRef(crypto.randomUUID()), initialMember = useRef(memberId)
  const [source, setSource] = useState<SourceChoice>({ sourceRecordId:'', sourceQuote:'', sourcePage:1 })
  useEffect(() => { if (existing) { setName(existing.item); setStart(existing.startsOn); setEnd(existing.endsOn); setFrequency(existing.timesPerDay); if(existing.sourceReference) setSource({ sourceRecordId:existing.sourceReference.recordId, sourceQuote:existing.sourceReference.quote, sourcePage:existing.sourceReference.page }) } }, [existing?.id])
  useEffect(() => { if (memberId !== initialMember.current) navigate('/cases', { replace: true }) }, [memberId, navigate])
  async function save() {
    if (pending.current || !eventId || memberId !== initialMember.current) return
    pending.current = true; setBusy(true); setFailure('')
    try { await caseService.observation(memberId, token, eventId, { ...(existingId ? { id: existingId } : {}), ...(source.sourceRecordId ? source : {}), requestId: requestId.current, item: name, startsOn: start, endsOn: end, timesPerDay: frequency, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, reminderEnabled: false }); if (useAppStore.getState().currentMemberId === memberId) navigate(-1) } catch (e) { setFailure(e instanceof Error ? e.message : '安排未保存，请重试') } finally { pending.current = false; setBusy(false) }
  }
  return <main className="app-shell continuity-page"><WebPageHeader title={existingId ? '调整观察' : '安排观察'}/><div className="continuity-scroll">{error ? <HohoButton onClick={reload}>重新加载情况</HohoButton> : !data ? <p>加载中…</p> : !item ? <p>未找到当前人物的情况</p> : <form className="continuity-form" onSubmit={e => { e.preventDefault(); void save() }}><p>关联：{item.event.title}</p><ObservationSource eventId={eventId!} token={token} value={source} onChange={setSource}/><label>观察什么<input required maxLength={300} value={name} onChange={e => setName(e.target.value)}/></label><label>记录频率<select value={frequency} onChange={e => setFrequency(Number(e.target.value))}>{[1,2,3,4,6,12].map(n => <option key={n} value={n}>每天{n}次</option>)}</select></label><label>开始日期<input type="date" required value={start} onChange={e => setStart(e.target.value)}/></label><label>截止日期<input type="date" min={start} required value={end} onChange={e => setEnd(e.target.value)}/></label><section className="continuity-card"><strong>安排后，在前台找到它</strong><p>正在跟进 → 这次情况 → 记录今天的变化</p></section><small>提醒默认关闭。当前仅支持站内待记录，系统通知通道尚未验证。</small>{failure && <p role="alert">{failure}</p>}<HohoButton type="submit" loading={busy} disabled={busy || !!item.event.caseArchivedAt}>确认安排</HohoButton></form>}</div></main>
}

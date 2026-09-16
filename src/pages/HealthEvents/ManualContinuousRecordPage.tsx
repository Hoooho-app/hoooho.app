import { ArrowLeft, Camera, ChevronDown, ChevronRight, ImagePlus, Link2, Pencil, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../../components/common'
import { HohoButton, StatusNotice } from '../../components/design-system'
import { BodyLocationPicker } from '../../components/health'
import type { BodyLocationSelection } from '../../features/body-location'
import { healthEventService } from '../../services/healthEvents'
import { healthEventRecordService } from '../../services/healthEventRecords'
import { eventAttachmentService } from '../../services/eventAttachments'
import { manualContinuousRecordService } from '../../services/manualContinuousRecords'
import { normalizeHealthEventTitle } from '../../services/healthEventFacts'
import { quickRecordService } from '../../services/quickRecords'
import { useAppStore } from '../../store/useAppStore'
import type { HealthEventApiDto, HealthEventRecordApiDto } from '../../types'
import type { ContinuousRecordKind, ContinuousRecordRelation, ContinuousTimePrecision, JournalMetadata } from '../../types/journal'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import { QuickRecordPhotos, useQuickRecordPhotos } from '../HealthEventDetail/components/QuickRecordPhotos'
import { journalCategoryLabels, journalListSummary } from './timeViewModel'
import { useJournal } from './useJournal'
import { toSymptomLocations } from './symptomRecordLogic'
import { freshManualContinuousDraft, loadManualContinuousDraft, manualContinuousDraftKey, type ManualContinuousDraft } from './manualContinuousDraft'
import './ManualContinuousRecord.css'

const kindLabels: Record<ContinuousRecordKind, string> = { description: '情况描述', symptom: '身体表现', care: '护理与处理', suspicion: '家长怀疑', history: '既往经历' }
const precisionLabels: Record<ContinuousTimePrecision, string> = { unknown: '不确定或记不清', approx: '大致时间', date: '只记得日期', exact: '具体时间' }

function technicalOccurredAt(draft: ManualContinuousDraft) {
  if (draft.precision === 'exact') return new Date(draft.timeExpression).toISOString()
  if (draft.precision === 'date') return new Date(`${draft.timeExpression}T12:00:00`).toISOString()
  return draft.timeReferenceAt
}

function displayTime(record: HealthEventRecordApiDto) {
  const value = record.journal?.continuous
  if (!value || value.timePrecision === 'unknown') return '发生时间不确定'
  if (value.timePrecision === 'approx') return value.timeExpression ?? '大致时间'
  if (value.timePrecision === 'date') return value.timeExpression ?? '日期未填写'
  return new Date(record.occurredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

function recordKind(record: HealthEventRecordApiDto) { return record.journal?.continuous?.kind ?? 'description' }
function rootOf(records: HealthEventRecordApiDto[]) { return records.find((item) => item.journal?.continuous?.relation === 'initial') ?? records[0] }
function toBodyLocationSelections(record: HealthEventRecordApiDto): BodyLocationSelection[] {
  return (record.journal?.symptom?.locations ?? []).map((location) => ({
    id: location.id,
    label: location.label,
    ...(location.bodyRegion ? { parentId: location.bodyRegion } : {}),
    locationType: location.locationLayer,
    ...(location.bodySide ? { laterality: location.bodySide } : {}),
    ...(location.bodyView ? { view: location.bodyView } : {})
  }))
}
function localDateTimeMax(now = new Date()) {
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 16)
}

export function ManualContinuousRecordPage() {
  const navigate = useNavigate(); const location = useLocation(); const { eventId, recordId } = useParams()
  const token = useAppStore((state) => state.authToken) ?? ''; const memberId = useAppStore((state) => state.currentMemberId); const members = useAppStore((state) => state.members)
  const member = members.find((item) => item.id === memberId) ?? null
  const path = location.pathname
  const detailMode = Boolean(eventId && !path.endsWith('/new') && !path.includes('/add') && !path.includes('/edit') && !path.endsWith('/related') && !path.includes('/source/'))
  const relatedMode = path.endsWith('/related'); const sourceMode = path.includes('/source/')
  const formMode: 'new' | 'supplement' | 'followup' | 'edit' = !eventId ? 'new' : path.includes('/edit/') ? 'edit' : new URLSearchParams(location.search).get('mode') === 'followup' ? 'followup' : 'supplement'
  const [event, setEvent] = useState<HealthEventApiDto | null>(null); const [records, setRecords] = useState<HealthEventRecordApiDto[]>([])
  const [loading, setLoading] = useState(Boolean(eventId)); const [error, setError] = useState(''); const [revision, setRevision] = useState(0)
  const journal = useJournal(memberId, token, revision)
  useEffect(() => { if (!eventId || !token) return; const controller = new AbortController(); setLoading(true); Promise.all([healthEventService.getById(eventId, token, controller.signal), manualContinuousRecordService.list(eventId, token, controller.signal)]).then(([nextEvent, nextRecords]) => { if (nextEvent.memberId !== memberId) throw new Error('这条记录不属于当前人物'); setEvent(nextEvent); setRecords(nextRecords); setError('') }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '记录加载失败') }).finally(() => { if (!controller.signal.aborted) setLoading(false) }); return () => controller.abort() }, [eventId, memberId, token, revision])
  if (!token || !member) return <StatusNotice tone="error" title="记录对象尚未准备好" />
  if (sourceMode) { const sourceId = path.split('/source/')[1]; const entry = journal.entries.find((item) => item.id === sourceId); return <PageShell title="原记录" onBack={() => navigate(-1)}><section className="continuous-card continuous-source-preview"><span className="continuous-kicker">只读原记录</span>{journal.loading ? <p>正在读取…</p> : entry ? <><h2>{journalCategoryLabels[entry.categories?.[0] ?? 'other']}</h2><p>{entry.timePrecision === 'unknown' ? '时间不确定' : new Date(entry.occurredAt).toLocaleString('zh-CN')}</p><div>{entry.content}</div></> : <p>原记录已不可用</p>}</section></PageShell> }
  if (relatedMode) {
    if (eventId && loading) return <PageShell title="关联已有记录" onBack={() => navigate(`/health-events/continuous/${eventId}`)}><StatusNotice title="正在读取已有关联" /></PageShell>
    if (eventId && (error || !rootOf(records))) return <PageShell title="关联已有记录" onBack={() => navigate(`/health-events/continuous/${eventId}`)}><StatusNotice tone="error" title={error || '原记录不可用，暂时不能修改关联'} action={<HohoButton onClick={() => setRevision((value) => value + 1)}>重试</HohoButton>} /></PageShell>
    const params = new URLSearchParams(location.search); const draftMode = params.get('mode') ?? 'new'; const draftEventId = params.get('eventId') || undefined; const draftRecordId = params.get('recordId') || undefined
    const draftKey = manualContinuousDraftKey(memberId, draftEventId, draftMode, draftRecordId); const draft = loadManualContinuousDraft(draftKey, freshManualContinuousDraft())
    if (params.get('draft') === '1') return <RelatedPicker entries={journal.entries.filter((item) => item.eventId !== draftEventId)} initial={draft.relatedRecordIds} saveLabel="完成选择" onBack={() => navigate(draftEventId ? `/health-events/continuous/${draftEventId}/${draftMode === 'edit' ? `edit/${draftRecordId}` : 'add'}${draftMode === 'followup' ? '?mode=followup' : ''}` : '/health-events/continuous/new')} onSave={async (ids) => { localStorage.setItem(draftKey, JSON.stringify({ ...draft, relatedRecordIds: ids })); navigate(draftEventId ? `/health-events/continuous/${draftEventId}/${draftMode === 'edit' ? `edit/${draftRecordId}` : 'add'}${draftMode === 'followup' ? '?mode=followup' : ''}` : '/health-events/continuous/new', { replace: true }) }} />
    if (eventId) { const initialRelations = Array.from(new Set(records.flatMap((item) => item.journal?.continuous?.relatedRecordIds ?? []))); return <RelatedPicker entries={journal.entries.filter((item) => item.eventId !== eventId)} initial={initialRelations} onBack={() => navigate(`/health-events/continuous/${eventId}`)} onSave={async (ids) => { const root = rootOf(records); if (!root) return; await manualContinuousRecordService.replaceRelations(eventId, root.id, ids, initialRelations, token); setRevision((value) => value + 1); navigate(`/health-events/continuous/${eventId}`, { replace: true }) }} /> }
  }
  if (detailMode && eventId) return <ContinuousDetail event={event} records={records} loading={loading} error={error} entries={journal.entries} onRetry={() => setRevision((value) => value + 1)} onBack={() => navigate('/health-events')} onAdd={(mode) => navigate(`/health-events/continuous/${eventId}/add?mode=${mode}`)} onEdit={(id) => navigate(`/health-events/continuous/${eventId}/edit/${id}`)} onRelated={() => navigate(`/health-events/continuous/${eventId}/related`)} onSource={(id) => navigate(`/health-events/continuous/${eventId}/source/${id}`)} />
  if (eventId && loading) return <PageShell title={formMode === 'edit' ? '编辑这条' : formMode === 'followup' ? '记录后续变化' : '补充当时情况'} onBack={() => navigate(`/health-events/continuous/${eventId}`)}><StatusNotice title="正在读取原记录" /></PageShell>
  if (eventId && (error || !event || !rootOf(records))) return <PageShell title={formMode === 'edit' ? '编辑这条' : formMode === 'followup' ? '记录后续变化' : '补充当时情况'} onBack={() => navigate(`/health-events/continuous/${eventId}`)}><StatusNotice tone="error" title={error || '原记录不可用，暂时不能继续记录'} action={<HohoButton onClick={() => setRevision((value) => value + 1)}>重试</HohoButton>} /></PageShell>
  return <ContinuousForm eventId={eventId} recordId={recordId} records={records} member={member} memberId={memberId} token={token} mode={formMode} onBack={() => navigate(eventId ? `/health-events/continuous/${eventId}` : '/health-events')} onSaved={(savedEventId) => { setRevision((value) => value + 1); navigate(`/health-events/continuous/${savedEventId}`, { replace: true }) }} />
}

function PageShell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return <main className="continuous-page"><header className="continuous-header"><button aria-label="返回" onClick={onBack} type="button"><ArrowLeft /></button><h1>{title}</h1><span /></header><div className="continuous-scroll">{children}</div></main>
}

function ContinuousForm({ eventId, recordId, records, member, memberId, token, mode, onBack, onSaved }: { eventId?: string; recordId?: string; records: HealthEventRecordApiDto[]; member: { name: string; avatar?: string }; memberId: string; token: string; mode: 'new' | 'supplement' | 'followup' | 'edit'; onBack: () => void; onSaved: (eventId: string) => void }) {
  const navigate = useNavigate()
  const editing = records.find((item) => item.id === recordId); const root = rootOf(records)
  const initial = useMemo(() => { const fresh = freshManualContinuousDraft(); if (!editing) return fresh; const meta = editing.journal?.continuous; return { ...fresh, narrative: editing.content, kind: meta?.kind ?? 'description', precision: meta?.timePrecision ?? 'unknown', timeExpression: meta?.timeExpression ?? '', timeReferenceAt: meta?.timeReferenceAt ?? editing.createdAt, relatedRecordIds: meta?.relatedRecordIds ?? [], locations: toBodyLocationSelections(editing) } }, [editing])
  const key = manualContinuousDraftKey(memberId, eventId, mode, recordId); const [draft, setDraft] = useState(() => loadManualContinuousDraft(key, initial)); const [saving, setSaving] = useState(false); const [verificationPending, setVerificationPending] = useState(false); const [pageError, setPageError] = useState(''); const [draftWarning, setDraftWarning] = useState(''); const textRef = useRef<HTMLTextAreaElement>(null); const cameraRef = useRef<HTMLInputElement>(null); const albumRef = useRef<HTMLInputElement>(null)
  const photos = useQuickRecordPhotos(memberId, token, 6, `continuous-${eventId ?? 'new'}-${mode}-${recordId ?? 'none'}`)
  const [existingPhotos, setExistingPhotos] = useState<Array<{ id: string; name: string; url: string }>>([])
  useEffect(() => {
    if (!eventId || !editing) { setExistingPhotos([]); return }
    const controller = new AbortController(); let urls: string[] = []
    void eventAttachmentService.list(eventId, token, controller.signal).then(async (items) => {
      const matching = items.filter((item) => item.recordId === editing.id)
      const hydrated = await Promise.all(matching.map(async (item) => ({ id: item.id, name: item.name, url: URL.createObjectURL(await eventAttachmentService.read(eventId, item.id, token, controller.signal)) })))
      urls = hydrated.map((item) => item.url); setExistingPhotos(hydrated)
    }).catch(() => { if (!controller.signal.aborted) setPageError('原照片暂时无法加载，文字内容仍可编辑') })
    return () => { controller.abort(); urls.forEach((url) => URL.revokeObjectURL(url)) }
  }, [editing, eventId, token])
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(draft)); setDraftWarning('') } catch { setDraftWarning('当前草稿未能保留，请不要关闭页面') } }, [draft, key])
  const update = <K extends keyof ManualContinuousDraft>(field: K, value: ManualContinuousDraft[K]) => { if (field === 'relatedRecordIds' && value === draft.relatedRecordIds) { navigate(`/health-events/continuous/related?draft=1&mode=${mode}${eventId ? `&eventId=${encodeURIComponent(eventId)}` : ''}${recordId ? `&recordId=${encodeURIComponent(recordId)}` : ''}`); return } setDraft((current) => ({ ...current, [field]: value })); setPageError('') }
  const save = async () => {
    if (saving) return
    if (!draft.narrative.trim() && !photos.photos.length) { setPageError('写下一点情况，或添加一张照片后再保存'); textRef.current?.focus(); return }
    if (draft.precision !== 'unknown' && !draft.timeExpression.trim()) { setPageError('请填写发生时间，或选择“不确定或记不清”'); return }
    setSaving(true); setPageError('')
    const relation: ContinuousRecordRelation = mode === 'new' ? 'initial' : mode === 'followup' ? 'follow_up' : editing?.journal?.continuous?.relation ?? 'supplement'
    const continuous = { kind: draft.kind, relation, ...(root?.id || editing?.journal?.continuous?.rootRecordId ? { rootRecordId: root?.id ?? editing!.journal!.continuous!.rootRecordId } : {}), timePrecision: draft.precision, ...(draft.timeExpression.trim() ? { timeExpression: draft.timeExpression.trim() } : {}), timeReferenceAt: draft.timeReferenceAt, ...(draft.relatedRecordIds.length ? { relatedRecordIds: [...new Set(draft.relatedRecordIds)] } : {}) }
    const journal: JournalMetadata = { categories: [...new Set([draft.kind === 'care' ? 'care' : 'symptom', ...(draft.locations.length ? ['symptom'] : [])])] as JournalMetadata['categories'], continuous, ...(draft.locations.length ? { symptom: { symptomCategory: 'other', otherCategoryText: '身体表现', locations: toSymptomLocations(draft.locations), descriptors: [], narrative: draft.narrative } } : {}) }
    try {
      if (mode === 'edit' && editing && !photos.photos.length) {
        await healthEventRecordService.update(editing.id, { content: draft.narrative.trim() || '照片记录', occurredAt: technicalOccurredAt(draft), sourceText: draft.narrative.trim() || null, journal }, token)
        localStorage.removeItem(key); onSaved(editing.eventId); return
      }
      const photoPayload = photos.payload()
      const input = { memberId, content: draft.narrative.trim() || '照片记录', rawText: draft.narrative.trim(), occurredAt: technicalOccurredAt(draft), inputChannel: 'text' as const, idempotencyKey: draft.operationId, title: normalizeHealthEventTitle('', draft.narrative.trim() || '照片记录'), journal, ...(photoPayload.photoIds.length ? { photoDraftId: photoPayload.draftId, photoIds: photoPayload.photoIds } : {}), ...(eventId && root ? { targetEventId: eventId, rootRecordId: root.id } : {}), ...(mode === 'edit' && editing ? { editRecordId: editing.id } : {}) }
      const result = await quickRecordService.create(input, token)
      photos.clearAfterSave(); localStorage.removeItem(key); onSaved(result.eventId)
    } catch (reason) {
      try {
        const status = await quickRecordService.status(draft.operationId, memberId, token)
        if (status.status === 'completed') { photos.clearAfterSave(); localStorage.removeItem(key); onSaved(status.eventId); return }
        setPageError(reason instanceof Error ? `${reason.message}。已确认没有写入，内容仍保留，可以重试` : '已确认没有写入，内容仍保留，可以重试')
      } catch {
        setVerificationPending(true)
        setPageError('保存结果暂时无法核实。内容仍保留，请先核实结果，不要重复提交。')
      }
    } finally { setSaving(false) }
  }
  const verifySave = async () => {
    setSaving(true); setPageError('')
    try {
      const status = await quickRecordService.status(draft.operationId, memberId, token)
      if (status.status === 'completed') { photos.clearAfterSave(); localStorage.removeItem(key); onSaved(status.eventId); return }
      setVerificationPending(false); setPageError('已确认这次没有写入，可以重新保存。')
    } catch { setPageError('仍然无法核实保存结果，请检查网络后再试。') } finally { setSaving(false) }
  }
  const title = mode === 'new' ? '记录情况' : mode === 'edit' ? '编辑这条' : mode === 'followup' ? '记录后续变化' : '补充当时情况'
  const locked = saving || verificationPending
  return <PageShell title={title} onBack={onBack}><div className="continuous-member"><Avatar name={member.name} src={member.avatar} size="sm" /><span>正在为 <strong>{member.name}</strong> 记录</span></div>{mode === 'followup' && <p className="continuous-guidance">之前的经过会保留，这里只记录新的变化。</p>}<fieldset className="continuous-form-fields" disabled={locked}><section className="continuous-card"><label className="continuous-narrative"><span>发生了什么？</span><textarea ref={textRef} aria-invalid={Boolean(pageError && !draft.narrative.trim())} maxLength={5000} onChange={(event) => update('narrative', event.target.value)} placeholder="可以照自己的说法完整写下来，不用先分类" value={draft.narrative} /></label><div className="continuous-photo-actions"><button onClick={() => cameraRef.current?.click()} type="button"><Camera />拍照</button><button onClick={() => albumRef.current?.click()} type="button"><ImagePlus />从相册选择</button></div>{existingPhotos.length > 0 && <div aria-label="原记录照片" className="continuous-existing-photos">{existingPhotos.map((photo) => <figure key={photo.id}><img alt={photo.name} src={photo.url} /><figcaption>{photo.name}</figcaption></figure>)}</div>}{photos.photos.length > 0 && <QuickRecordPhotos limit={6} model={photos} />}</section><section className="continuous-card"><button className="continuous-fold" onClick={() => update('optionalOpen', !draft.optionalOpen)} type="button"><span><strong>按需补充</strong><small>归类、身体部位、相关记录</small></span><ChevronDown className={draft.optionalOpen ? 'is-open' : ''} /></button>{draft.optionalOpen && <div className="continuous-optional"><label><span>这条内容归为</span><select value={draft.kind} onChange={(event) => update('kind', event.target.value as ContinuousRecordKind)}>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><BodyLocationPicker compact label="身体部位（选填）" value={draft.locations} onChange={(value) => update('locations', value)} /><button className="continuous-related-link" onClick={() => update('relatedRecordIds', draft.relatedRecordIds)} type="button"><Link2 />关联已有记录<ChevronRight /></button></div>}</section><section className="continuous-card continuous-time"><h2>发生时间</h2><label><span>记得多清楚？</span><select value={draft.precision} onChange={(event) => { const precision = event.target.value as ContinuousTimePrecision; setDraft((current) => ({ ...current, precision, timeExpression: '' })) }}>{Object.entries(precisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{draft.precision === 'approx' && <label><span>大致时间</span><input placeholder="例如：今天晚上、以前某次" value={draft.timeExpression} onChange={(event) => update('timeExpression', event.target.value)} /></label>}{draft.precision === 'date' && <label><span>日期</span><input type="date" max={getLocalDateKey(new Date()) ?? undefined} value={draft.timeExpression} onChange={(event) => update('timeExpression', event.target.value)} /></label>}{draft.precision === 'exact' && <label><span>具体时间</span><input type="datetime-local" max={localDateTimeMax()} value={draft.timeExpression} onChange={(event) => update('timeExpression', event.target.value)} /></label>}</section><input ref={cameraRef} accept="image/*" capture="environment" hidden type="file" onChange={(event) => { photos.chooseFiles(event.target.files); event.currentTarget.value = '' }} /><input ref={albumRef} accept="image/jpeg,image/png,image/webp" hidden multiple type="file" onChange={(event) => { photos.chooseFiles(event.target.files); event.currentTarget.value = '' }} /></fieldset>{draftWarning && <p className="continuous-warning" role="alert">{draftWarning}</p>}{pageError && <p className="continuous-error" role="alert">{pageError}</p>}{verificationPending ? <HohoButton className="continuous-save" disabled={saving} loading={saving} onClick={() => void verifySave()} size="large">核实保存结果</HohoButton> : <HohoButton className="continuous-save" disabled={saving || photos.blocked} loading={saving} onClick={() => void save()} size="large">{mode === 'edit' ? '保存修改' : '保存'}</HohoButton>}</PageShell>
}

function ContinuousDetail({ event, records, loading, error, entries, onRetry, onBack, onAdd, onEdit, onRelated, onSource }: { event: HealthEventApiDto | null; records: HealthEventRecordApiDto[]; loading: boolean; error: string; entries: ReturnType<typeof useJournal>['entries']; onRetry: () => void; onBack: () => void; onAdd: (mode: 'supplement' | 'followup') => void; onEdit: (id: string) => void; onRelated: () => void; onSource: (id: string) => void }) {
  if (loading) return <PageShell title="情况详情" onBack={onBack}><StatusNotice title="正在读取记录" /></PageShell>
  if (error || !event) return <PageShell title="情况详情" onBack={onBack}><StatusNotice tone="error" title={error || '记录不存在'} action={<HohoButton onClick={onRetry}>重试</HohoButton>} /></PageShell>
  const visible = records.filter((item) => item.journal?.continuous); const sections: ContinuousRecordKind[] = ['description', 'symptom', 'care', 'history', 'suspicion']; const relatedIds = [...new Set(visible.flatMap((item) => item.journal?.continuous?.relatedRecordIds ?? []))]
  const summary = rootOf(visible)?.content || event.title
  return <PageShell title="情况详情" onBack={onBack}><section className="continuous-detail-hero"><span>持续记录</span><h2>{summary}</h2><p>{visible.length} 条内容</p></section><div className="continuous-detail-actions"><HohoButton onClick={() => onAdd('supplement')}><Plus />补充当时情况</HohoButton><HohoButton variant="secondary" onClick={() => onAdd('followup')}><Plus />记录后续变化</HohoButton></div>{sections.map((kind) => { const items = visible.filter((item) => recordKind(item) === kind); if (!items.length) return null; return <section className="continuous-detail-section" key={kind}><h2>{kind === 'history' ? '补述的既往经历' : kind === 'suspicion' ? '家长怀疑' : kind === 'description' ? '这次经过' : kindLabels[kind]}</h2>{items.map((record) => <article className="continuous-entry" key={record.id}><div><span>{displayTime(record)}</span><button onClick={() => onEdit(record.id)} type="button"><Pencil />编辑这条</button></div><p>{record.content}</p></article>)}</section> })}<section className="continuous-detail-section"><div className="continuous-section-title"><h2>相关记录</h2><button onClick={onRelated} type="button"><Plus />管理关联</button></div>{relatedIds.length ? relatedIds.map((id) => { const entry = entries.find((item) => item.id === id); return <article className="continuous-related-item" key={id}><button onClick={() => onSource(id)} type="button"><span><strong>{entry ? journalCategoryLabels[entry.categories?.[0] ?? 'other'] : '原记录已不可用'}</strong><small>{entry ? journalListSummary(entry) : id}</small></span><ChevronRight /></button></article> }) : <p className="continuous-empty">还没有关联其他记录</p>}</section></PageShell>
}

function RelatedPicker({ entries, initial, saveLabel = '保存关联', onBack, onSave }: { entries: ReturnType<typeof useJournal>['entries']; initial: string[]; saveLabel?: string; onBack: () => void; onSave: (ids: string[]) => Promise<void> }) {
  const [selected, setSelected] = useState(initial); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  return <PageShell title="关联已有记录" onBack={onBack}>{entries.length ? <div className="continuous-picker">{entries.map((entry) => { const active = selected.includes(entry.id); return <button aria-pressed={active} key={entry.id} onClick={() => setSelected((current) => active ? current.filter((id) => id !== entry.id) : [...current, entry.id])} type="button"><span><strong>{journalCategoryLabels[entry.categories?.[0] ?? 'other']}</strong><small>{entry.timePrecision === 'unknown' ? '时间不确定' : new Date(entry.occurredAt).toLocaleString('zh-CN')}</small><em>{journalListSummary(entry)}</em></span>{active ? <X /> : <Plus />}</button> })}</div> : <p className="continuous-empty">当前孩子还没有可关联的记录，可以返回后直接补述。</p>}{error && <p className="continuous-error" role="alert">{error}</p>}<HohoButton className="continuous-save" disabled={saving} loading={saving} onClick={() => { setSaving(true); setError(''); void onSave(selected).catch((reason) => { setError(reason instanceof Error ? reason.message : '关联没有保存，请重试'); setSaving(false) }) }} size="large">{saveLabel}</HohoButton></PageShell>
}

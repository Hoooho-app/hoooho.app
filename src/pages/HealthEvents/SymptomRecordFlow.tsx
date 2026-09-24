import { ArrowLeft, Check, ChevronLeft, ChevronRight, Mic, Paperclip, PersonStanding, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { BodyLocationPicker } from '../../components/health'
import type { BodyLocationSelection } from '../../features/body-location'
import type { JournalMetadata, JournalSymptomDetails, SymptomImpactLevel } from '../../types/journal'
import { localDateTimeToIso, localDateTimeValue } from '../../utils/healthOccurredAt'
import { useAppStore } from '../../store/useAppStore'
import { symptomPreviewService } from '../../services/symptomPreview'
import { QuickRecordPhotos, useQuickRecordPhotos, type QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { inferSymptomCategory, toSymptomLocations } from './symptomRecordLogic'
import { journalCategoryLabels, journalListSummary, type JournalEntry } from './timeViewModel'
import { useJournal } from './useJournal'

type SaveRecord = (content: string, occurredAt: string, channel: 'text', photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>
type SupplementKey = 'diet' | 'elimination' | 'medication' | 'visit'
export type SymptomLinkedRecordIds = Partial<Record<SupplementKey, string[]>>
interface Draft {
  narrative: string; summary: string; keywords: string[]; locationText: string; locations: BodyLocationSelection[]; occurredAt: string
  linkedRecordIds: SymptomLinkedRecordIds; impactLevel?: SymptomImpactLevel; triggerText: string
  trend?: JournalSymptomDetails['trend']; recurrent?: boolean; shortNote: string
}
const newDraft = (): Draft => ({ narrative: '', summary: '', keywords: [], locationText: '', locations: [], occurredAt: localDateTimeValue(), linkedRecordIds: {}, triggerText: '', shortNote: '' })
const draftKey = (memberId: string) => `hoooho-symptom-record-draft:${memberId}`
const supplementLabels: Record<SupplementKey, string> = { diet: '进食', elimination: '排便', medication: '用药', visit: '就医' }
const supplementCategory: Record<SupplementKey, string> = { diet: 'diet', elimination: 'elimination', medication: 'medication', visit: 'visit' }

function restoreDraft(memberId: string) {
  const fresh = newDraft()
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey(memberId)) || '{}') as Partial<Draft>
    const hasUserContent = Boolean(saved.narrative?.trim() || saved.summary?.trim() || saved.locationText?.trim() || saved.locations?.length || Object.values(saved.linkedRecordIds ?? {}).some((ids) => ids?.length) || saved.triggerText?.trim() || saved.shortNote?.trim() || saved.impactLevel || saved.trend || saved.recurrent)
    return hasUserContent ? { ...fresh, ...saved, linkedRecordIds: saved.linkedRecordIds ?? {} } : fresh
  } catch { return fresh }
}

function selectedCount(linked: Draft['linkedRecordIds']) { return Object.values(linked).reduce((sum, ids) => sum + (ids?.length ?? 0), 0) }

function validLinkedRecords(linked: SymptomLinkedRecordIds, entries: JournalEntry[]) {
  const available = new Set(entries.map((entry) => entry.id))
  return Object.fromEntries(Object.entries(linked).map(([key, ids]) => [key, ids?.filter((id) => available.has(id))]).filter(([, ids]) => ids?.length)) as SymptomLinkedRecordIds
}

const impactLabels: Record<SymptomImpactLevel, string> = { little: '轻微影响', some: '有些影响', clear: '明显影响' }
const trendLabels: Partial<Record<NonNullable<JournalSymptomDetails['trend']>, string>> = { more_noticeable: '加重了', improving: '减轻了', same: '没有明显变化' }

function symptomOptionalSummary(draft: Draft) {
  const primary = draft.impactLevel ? impactLabels[draft.impactLevel] : draft.trend ? trendLabels[draft.trend] : draft.recurrent ? '反复出现' : ''
  const count = [draft.impactLevel, draft.triggerText.trim(), draft.trend, draft.recurrent, draft.shortNote.trim()].filter(Boolean).length
  return count ? `补充信息 · ${primary || `已填${count}项`}${count > 1 && primary ? `等${count}项` : ''}` : ''
}

function formatLinkedDate(value: string) {
  const date = new Date(value)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat('zh-CN', { ...(sameYear ? {} : { year: 'numeric' }), month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

export function SymptomRecordFlow({ memberId, token, onBack, onClose, onConfirm, onSaved }: { memberId: string; token: string; onBack: () => void; onClose: () => void; onConfirm: SaveRecord; onSaved: (message: string) => void }) {
  const [draft, setDraft] = useState<Draft>(() => restoreDraft(memberId))
  const [saving, setSaving] = useState(false), [pageError, setPageError] = useState('')
  const [recognition, setRecognition] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle')
  const [fieldErrors, setFieldErrors] = useState<{ narrative?: string; location?: string; time?: string }>({})
  const [relatedOpen, setRelatedOpen] = useState(false), [optionalOpen, setOptionalOpen] = useState(false), [listening, setListening] = useState(false), [composing, setComposing] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null), narrativeRef = useRef<HTMLTextAreaElement>(null)
  const summaryEditedRef = useRef(Boolean(draft.summary)), locationEditedRef = useRef(Boolean(draft.locationText || draft.locations.length))
  const previewVersionRef = useRef(0)
  const memberName = useAppStore((state) => state.members.find((member) => member.id === memberId)?.name ?? (state.currentMemberId === memberId ? state.profile?.nickname : '') ?? '')
  const photos = useQuickRecordPhotos(memberId, token, 6, 'symptom')
  const journal = useJournal(memberId, token, 0)
  useEffect(() => { sessionStorage.setItem(draftKey(memberId), JSON.stringify(draft)) }, [draft, memberId])
  useEffect(() => {
    if (composing) return
    const narrative = draft.narrative.trim()
    const version = ++previewVersionRef.current
    if (narrative.length < 2) {
      setRecognition('idle')
      setDraft((current) => ({ ...current, keywords: [], ...(!summaryEditedRef.current ? { summary: '' } : {}), ...(!locationEditedRef.current ? { locationText: '' } : {}) }))
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setRecognition('loading')
      try {
        const result = await symptomPreviewService.preview(memberId, { rawInput: narrative, selectedOccurredAt: localDateTimeToIso(draft.occurredAt), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }, token, controller.signal)
        if (previewVersionRef.current !== version) return
        setDraft((current) => current.narrative.trim() !== narrative ? current : {
          ...current,
          keywords: result.keywords,
          summary: summaryEditedRef.current ? current.summary : result.summary,
          locationText: locationEditedRef.current ? current.locationText : result.bodyLocation || ''
        })
        setRecognition(result.status)
      } catch (reason) {
        if ((reason as Error).name !== 'AbortError' && previewVersionRef.current === version) setRecognition('error')
      }
    }, 420)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [composing, draft.narrative, draft.occurredAt, memberId, token])
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft((current) => ({ ...current, [key]: value })); setPageError('') }
  const updateNarrative = (value: string) => {
    setDraft((current) => ({ ...current, narrative: value, keywords: [] }))
    if (!composing) setRecognition(value.trim() ? 'loading' : 'idle')
    setFieldErrors((current) => ({ ...current, narrative: undefined }))
    setPageError('')
  }
  const validTime = Boolean(draft.occurredAt && Number.isFinite(Date.parse(draft.occurredAt)) && Date.parse(draft.occurredAt) <= Date.now())
  const canSave = Boolean(draft.narrative.trim() && validTime && !photos.blocked)
  const isDirty = Boolean(draft.narrative.trim() || draft.summary.trim() || draft.locationText.trim() || draft.locations.length || selectedCount(draft.linkedRecordIds) || draft.triggerText.trim() || draft.shortNote.trim() || draft.impactLevel || draft.trend || draft.recurrent || photos.photos.length)
  const leave = (action: () => void) => { if (!isDirty || window.confirm('这条症状还没有保存，确定退出吗？')) action() }
  const startVoice = () => {
    type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: (event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void; onend: () => void; onerror: () => void; start: () => void }
    const speechWindow = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }; const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) { setPageError('当前浏览器暂不支持语音输入，可以直接输入文字'); return }
    const recognition = new Recognition(); recognition.lang = 'zh-CN'; recognition.continuous = false; recognition.interimResults = false
    recognition.onresult = (event) => updateNarrative(`${draft.narrative}${draft.narrative ? '，' : ''}${event.results[0][0].transcript}`); recognition.onend = () => setListening(false); recognition.onerror = () => { setListening(false); setPageError('没有听清，可以重试或直接输入文字') }; setListening(true); recognition.start()
  }
  const save = async () => {
    if (saving) return
    if (!draft.narrative.trim()) { setFieldErrors((current) => ({ ...current, narrative: '请填写主要症状' })); narrativeRef.current?.focus(); return }
    if (!validTime) { setFieldErrors((current) => ({ ...current, time: '发生时间不能晚于现在' })); return }
    if (!canSave) return
    setSaving(true); setPageError(''); setFieldErrors({})
    try {
      const details: JournalSymptomDetails = { symptomCategory: inferSymptomCategory(draft.keywords), narrative: draft.narrative, keywords: draft.keywords, locations: toSymptomLocations(draft.locations), descriptors: [], linkedRecordIds: validLinkedRecords(draft.linkedRecordIds, journal.entries), ...(draft.locationText.trim() ? { locationText: draft.locationText.trim() } : {}), ...(draft.impactLevel ? { impactLevel: draft.impactLevel } : {}), ...(draft.triggerText.trim() ? { triggerText: draft.triggerText.trim() } : {}), ...(draft.trend ? { trend: draft.trend } : {}), ...(draft.recurrent ? { recurrent: true } : {}), ...(draft.shortNote.trim() ? { shortNote: draft.shortNote.trim() } : {}) }
      if (draft.summary.trim()) details.generatedSummary = draft.summary.trim()
      const occurredAt = localDateTimeToIso(draft.occurredAt)
      const message = await onConfirm(draft.narrative.trim(), occurredAt, 'text', photos.payload(), { categories: ['symptom'], symptom: details, occurredAt, timePrecision: 'exact' })
      photos.clearAfterSave(); sessionStorage.removeItem(draftKey(memberId)); onSaved(message); onClose()
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '保存失败，请重试'
      if (message.includes('主要症状') || message.includes('其他症状')) setFieldErrors((current) => ({ ...current, narrative: '请填写主要症状' }))
      else setPageError(message)
    } finally { setSaving(false) }
  }
  const selectedLocation = draft.locations[0]
  const linkedRecordIds = validLinkedRecords(draft.linkedRecordIds, journal.entries)
  const selectedEntries = journal.entries.filter((entry) => Object.values(linkedRecordIds).flat().includes(entry.id))
  const optionalSummary = symptomOptionalSummary(draft)
  return <div className="symptom-record-page-layer"><section aria-label="记录症状" aria-modal="true" className="symptom-record-page" role="dialog">
    <header><button aria-label="返回" disabled={saving} onClick={() => leave(onBack)} type="button"><ArrowLeft size={22} /></button><h1>记录症状</h1><button aria-label="关闭" disabled={saving} onClick={() => leave(onClose)} type="button"><X size={21} /></button></header>
    <div className="symptom-record-scroll">
      <p className="symptom-record-member">正在为：<strong>{memberName || '记录对象加载中'}</strong></p>
      <section className="symptom-narrative"><div className="symptom-heading"><h2>主要症状（主述）</h2><button aria-label="语音输入症状" className={listening ? 'is-listening' : ''} onClick={startVoice} type="button"><Mic size={19} /></button></div><textarea ref={narrativeRef} aria-describedby={fieldErrors.narrative ? 'symptom-narrative-error' : undefined} aria-invalid={Boolean(fieldErrors.narrative)} aria-label="主要症状" autoFocus maxLength={1000} onBlur={() => { if (narrativeRef.current) narrativeRef.current.scrollTop = 0 }} onChange={(event) => updateNarrative(event.target.value)} onCompositionEnd={(event) => { setComposing(false); updateNarrative(event.currentTarget.value) }} onCompositionStart={() => { previewVersionRef.current += 1; setComposing(true); setRecognition('idle') }} placeholder="描述哪里不舒服、有什么变化" value={draft.narrative} />{fieldErrors.narrative && <p className="symptom-field-error" id="symptom-narrative-error" role="alert">{fieldErrors.narrative}</p>}{recognition === 'loading' && <p className="symptom-extraction-note" role="status">正在整理症状描述…</p>}{recognition === 'success' && <p className="symptom-extraction-note" role="status">已整理，可继续修改</p>}{recognition === 'empty' && <p className="symptom-extraction-note">暂未生成摘要，可直接保存原文。</p>}{recognition === 'error' && <p className="symptom-extraction-note">暂时无法整理，可直接保存原文。</p>}{draft.keywords.length > 0 && <div className="symptom-keywords">{draft.keywords.map((keyword) => <button aria-label={`移除${keyword}`} key={keyword} onClick={() => update('keywords', draft.keywords.filter((item) => item !== keyword))} type="button">{keyword}<X size={12} /></button>)}</div>}<label className="symptom-summary-field"><span>症状摘要（选填）</span><input aria-label="症状摘要（选填）" maxLength={180} onChange={(event) => { summaryEditedRef.current = true; update('summary', event.target.value) }} placeholder="可修改或留空，原文会完整保存" value={draft.summary} /></label></section>
        <section className="symptom-location-compact"><div className="symptom-heading"><h2>症状部位（选填）</h2></div><div className="symptom-location-input"><input aria-label="症状部位（选填）" maxLength={120} onChange={(event) => { locationEditedRef.current = true; update('locationText', event.target.value) }} placeholder="例如：左肘窝；没有明确部位可留空" value={draft.locationText} /><BodyLocationPicker buttonLabel={selectedLocation ? '修改' : '定位'} compact label="" showEmptyState={false} value={draft.locations} onChange={(locations) => { locationEditedRef.current = true; setDraft((current) => ({ ...current, locations, locationText: locations[0]?.label ?? current.locationText })); setPageError('') }} /></div>{selectedLocation && <div className="symptom-location-preview"><span aria-hidden="true" className="symptom-location-silhouette"><PersonStanding size={34} strokeWidth={1.35} /><i>1</i></span><span><strong>{selectedLocation.label} · 1号区域</strong><small>{`身体${selectedLocation.locationType === 'surface' ? '表面' : '内部'} · ${selectedLocation.view === 'back' ? '背面' : '正面'}`}</small></span></div>}</section>
      <div className="symptom-compact-grid">
        <section className={`symptom-compact-row${photos.photos.length ? ' is-expanded' : ''}`}><button onClick={() => photoInputRef.current?.click()} type="button"><span><Paperclip size={19} /><strong>添加照片</strong></span><span>{photos.photos.length ? `${photos.photos.length}张` : null}<ChevronRight size={18} /></span></button>{photos.photos.length > 0 && <QuickRecordPhotos limit={6} model={photos} showAddButton={false} />}</section>
        <section className={`symptom-compact-row${optionalOpen ? ' is-expanded' : ''}`}><button onClick={() => setOptionalOpen((value) => !value)} type="button"><span><Plus size={19} /><strong>{optionalSummary || '补充症状信息'}</strong><small>影响、诱因、变化、备注</small></span><span>{optionalSummary ? '已填写' : null}<ChevronRight className={optionalOpen ? 'is-open' : ''} size={18} /></span></button>{optionalOpen && <div className="symptom-optional-fields"><label><span>影响程度</span><small>观察吃饭、睡眠、活动或情绪；不确定可不填</small><select aria-label="影响程度" onChange={(event) => update('impactLevel', (event.target.value || undefined) as SymptomImpactLevel | undefined)} value={draft.impactLevel ?? ''}><option value="">未填写</option><option value="little">轻微影响</option><option value="some">有些影响</option><option value="clear">明显影响</option></select></label><label><span>触发或诱因</span><input maxLength={160} onChange={(event) => update('triggerText', event.target.value)} value={draft.triggerText} /></label><label><span>变化趋势</span><select aria-label="变化趋势" onChange={(event) => update('trend', (event.target.value || undefined) as JournalSymptomDetails['trend'])} value={draft.trend ?? ''}><option value="">未填写</option><option value="more_noticeable">加重了</option><option value="improving">减轻了</option><option value="same">没有明显变化</option></select></label><label className="symptom-recurrent"><input checked={Boolean(draft.recurrent)} onChange={(event) => update('recurrent', event.target.checked || undefined)} type="checkbox" /><span>反复出现</span></label><label><span>备注</span><textarea maxLength={160} onChange={(event) => update('shortNote', event.target.value)} value={draft.shortNote} /></label></div>}</section>
      </div>
      <section className="symptom-compact-row symptom-related-summary"><button onClick={() => setRelatedOpen(true)} type="button"><span><Plus size={19} /><strong>关联其他记录</strong><small>进食、排便、用药、就医</small></span><span>{selectedCount(linkedRecordIds) ? `已关联 ${selectedCount(linkedRecordIds)} 条` : '选填'}<ChevronRight size={18} /></span></button>{selectedEntries.length > 0 && <div className="symptom-related-selected">{selectedEntries.map((entry) => <div key={entry.id}><strong>{journalCategoryLabels[entry.categories?.[0] ?? 'other']}</strong><span>{formatLinkedDate(entry.occurredAt)}</span><p>{journalListSummary(entry)}</p></div>)}</div>}</section>
      <label className="symptom-time-row"><span>发生时间</span><input aria-describedby={fieldErrors.time ? 'symptom-time-error' : undefined} aria-invalid={Boolean(fieldErrors.time)} aria-label="发生时间" max={localDateTimeValue()} onChange={(event) => { update('occurredAt', event.target.value); setFieldErrors((current) => ({ ...current, time: undefined })) }} type="datetime-local" value={draft.occurredAt} />{fieldErrors.time && <small className="symptom-field-error" id="symptom-time-error" role="alert">{fieldErrors.time}</small>}</label>
      {pageError && <p className="symptom-save-error" role="alert">{pageError}</p>}{photos.blocked && <p className="symptom-save-error" role="alert">{photos.photos.some((photo) => photo.status === 'failed') ? '有照片上传失败，请重试或移除' : '照片上传中，请稍候'}</p>}<div className="symptom-record-save"><HohoButton disabled={saving || photos.blocked} fullWidth loading={saving} onClick={() => void save()} size="large">保存</HohoButton></div>
    </div>
    <input ref={photoInputRef} accept="image/*" hidden multiple onChange={(event) => { photos.chooseFiles(event.target.files); event.currentTarget.value = '' }} type="file" />
    <RelatedRecordsSheet entries={journal.entries} error={journal.error} linked={linkedRecordIds} loading={journal.loading} onChange={(value) => update('linkedRecordIds', value)} onClose={() => setRelatedOpen(false)} onRetry={journal.retry} open={relatedOpen} />
  </section></div>
}

export function RelatedRecordsSheet({ entries, error, linked, loading, onChange, onClose, onRetry, open }: { entries: JournalEntry[]; error: string; linked: SymptomLinkedRecordIds; loading: boolean; onChange: (value: SymptomLinkedRecordIds) => void; onClose: () => void; onRetry: () => void; open: boolean }) {
  const [category, setCategory] = useState<SupplementKey | null>(null)
  useEffect(() => { if (!open) setCategory(null) }, [open])
  const toggle = (key: SupplementKey, id: string) => { const ids = linked[key] ?? []; onChange({ ...linked, [key]: ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id] }) }
  const candidates = category ? entries.filter((entry) => (entry.categories ?? []).includes(supplementCategory[category] as never)).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)) : []
  return <BottomSheetSurface label="关联其他记录" onClose={onClose} open={open} size="workspace" title={category ? supplementLabels[category] : '关联其他记录'} footer={<HohoButton fullWidth onClick={onClose} size="large">完成</HohoButton>}>
    {category ? <div className="symptom-related-list"><button className="symptom-related-back" onClick={() => setCategory(null)} type="button"><ChevronLeft size={18} />返回记录类型</button>{loading ? <StatusNotice title="正在读取可关联记录" /> : error ? <StatusNotice action={<HohoButton variant="secondary" onClick={onRetry}>重新加载</HohoButton>} tone="error" title={error} /> : candidates.length ? candidates.map((entry) => { const checked = (linked[category] ?? []).includes(entry.id); return <button aria-pressed={checked} key={entry.id} onClick={() => toggle(category, entry.id)} type="button"><span><strong>{journalCategoryLabels[entry.categories?.[0] ?? 'other']}</strong><small>{new Date(entry.occurredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</small><em>{journalListSummary(entry)}</em></span>{checked && <Check size={20} />}</button> }) : <div className="symptom-related-empty"><strong>没有可关联的{supplementLabels[category]}记录</strong><span>可以返回选择其他类型</span></div>}</div> : <div className="symptom-supplement-tabs">{(Object.keys(supplementLabels) as SupplementKey[]).map((key) => <button key={key} onClick={() => setCategory(key)} type="button"><span>{supplementLabels[key]}</span><small>{(linked[key]?.length ?? 0) ? `已选 ${linked[key]!.length} 条` : '选择具体记录'}</small></button>)}</div>}
  </BottomSheetSurface>
}

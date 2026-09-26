import { Check, ChevronDown, ChevronLeft, Clock3, MapPin, Paperclip, Plus, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { ChildBodyLocationPicker } from '../../components/health/body-location/ChildBodyLocationPicker'
import { childSelectionKey } from '../../features/body-location/childBodyCatalog'
import type { BodyLocationSelection } from '../../features/body-location'
import type { JournalMetadata, JournalSymptomDetails, SymptomImpactLevel } from '../../types/journal'
import { localDateTimeToIso } from '../../utils/healthOccurredAt'
import { symptomPreviewService } from '../../services/symptomPreview'
import { QuickRecordPhotos, useQuickRecordPhotos, type QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { inferSymptomCategory, symptomOptionalSummary, toSymptomLocations } from './symptomRecordLogic'
import { journalCategoryLabels, journalListSummary, type JournalEntry } from './timeViewModel'
import { OccurrenceTimeField, useOccurrenceTime } from './OccurrenceTimeField'
import './SymptomRecordFlow.css'

type SaveRecord = (content: string, occurredAt: string, channel: 'text', photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>
type SupplementKey = 'diet' | 'elimination' | 'medication' | 'visit'
export type SymptomLinkedRecordIds = Partial<Record<SupplementKey, string[]>>
interface Draft {
  narrative: string; summary: string; keywords: string[]; locationText: string; locations: BodyLocationSelection[]; occurredAt?: string
  impactLevel?: SymptomImpactLevel; triggerText: string; trend?: JournalSymptomDetails['trend']; shortNote: string
}
const newDraft = (): Draft => ({ narrative: '', summary: '', keywords: [], locationText: '', locations: [], triggerText: '', shortNote: '' })
const draftKey = (memberId: string) => `hoooho-symptom-record-draft:${memberId}`
const supplementLabels: Record<SupplementKey, string> = { diet: '进食', elimination: '排便', medication: '用药', visit: '就医' }
const supplementCategory: Record<SupplementKey, string> = { diet: 'diet', elimination: 'elimination', medication: 'medication', visit: 'visit' }

function restoreDraft(memberId: string) {
  const fresh = newDraft()
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey(memberId)) || '{}') as Partial<Draft>
    const hasUserContent = Boolean(saved.narrative?.trim() || saved.summary?.trim() || saved.locationText?.trim() || saved.locations?.length || saved.triggerText?.trim() || saved.impactLevel || saved.trend || saved.shortNote?.trim() || saved.occurredAt)
    return hasUserContent ? { ...fresh, ...saved } : fresh
  } catch { return fresh }
}

const impactLabels: Record<SymptomImpactLevel, string> = { little: '轻度', some: '中度', clear: '重度' }
const impactOptions: readonly [SymptomImpactLevel, string][] = [['little', '轻度'], ['some', '中度'], ['clear', '重度']]
const trendLabels: Partial<Record<NonNullable<JournalSymptomDetails['trend']>, string>> = {
  improving: '减轻', same: '无明显变化', more_noticeable: '加重', returned: '再次出现', recurrent: '反复出现', unclear: '变化不明确'
}
const trendOptions: readonly [NonNullable<JournalSymptomDetails['trend']>, string][] = [['improving', '减轻'], ['same', '无明显变化'], ['more_noticeable', '加重']]

export function SymptomRecordFlow({ memberId, token, selectedDay, today, onBack, onClose, onConfirm, onSaved }: { memberId: string; token: string; selectedDay: string; today: string; onBack: () => void; onClose: () => void; onConfirm: SaveRecord; onSaved: (message: string) => void }) {
  const [draft, setDraft] = useState<Draft>(() => restoreDraft(memberId))
  const [saving, setSaving] = useState(false), [pageError, setPageError] = useState('')
  const [recognition, setRecognition] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle')
  const [fieldErrors, setFieldErrors] = useState<{ narrative?: string; location?: string; time?: string }>({})
  const [optionalOpen, setOptionalOpen] = useState(false), [composing, setComposing] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null), narrativeRef = useRef<HTMLTextAreaElement>(null)
  const locationEditedRef = useRef(Boolean(draft.locationText || draft.locations.length))
  const previewVersionRef = useRef(0)
  const photos = useQuickRecordPhotos(memberId, token, 6, 'symptom')
  const occurrence = useOccurrenceTime(selectedDay, today, draft.occurredAt)
  useEffect(() => { sessionStorage.setItem(draftKey(memberId), JSON.stringify(draft)) }, [draft, memberId])
  useEffect(() => {
    if (composing) return
    const narrative = draft.narrative.trim()
    const version = ++previewVersionRef.current
    if (narrative.length < 2) {
      setRecognition('idle')
      setDraft((current) => ({ ...current, keywords: [], summary: '', ...(!locationEditedRef.current ? { locationText: '' } : {}) }))
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setRecognition('loading')
      try {
        const previewOccurredAt = occurrence.mode === 'now' ? new Date().toISOString() : localDateTimeToIso(occurrence.specifiedValue)
        const result = await symptomPreviewService.preview(memberId, { rawInput: narrative, selectedOccurredAt: previewOccurredAt, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }, token, controller.signal)
        if (previewVersionRef.current !== version) return
        setDraft((current) => current.narrative.trim() !== narrative ? current : {
          ...current,
          keywords: result.keywords,
          summary: result.summary,
          locationText: locationEditedRef.current ? current.locationText : result.bodyLocation || ''
        })
        setRecognition(result.status)
      } catch (reason) {
        if ((reason as Error).name !== 'AbortError' && previewVersionRef.current === version) setRecognition('error')
      }
    }, 420)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [composing, draft.narrative, memberId, occurrence.mode, occurrence.specifiedValue, token])
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft((current) => ({ ...current, [key]: value })); setPageError('') }
  const updateNarrative = (value: string) => {
    setDraft((current) => ({ ...current, narrative: value, keywords: [] }))
    if (!composing) setRecognition(value.trim() ? 'loading' : 'idle')
    setFieldErrors((current) => ({ ...current, narrative: undefined }))
    setPageError('')
  }
  const canSave = Boolean(draft.narrative.trim() && !photos.blocked)
  const isDirty = Boolean(draft.narrative.trim() || draft.summary.trim() || draft.locationText.trim() || draft.locations.length || draft.triggerText.trim() || draft.impactLevel || draft.trend || draft.shortNote.trim() || draft.occurredAt || photos.photos.length)
  const leave = (action: () => void) => { if (!isDirty || window.confirm('这条症状还没有保存，确定退出吗？')) action() }
  const save = async () => {
    if (saving) return
    if (!draft.narrative.trim()) { setFieldErrors((current) => ({ ...current, narrative: '请填写哪里不舒服' })); narrativeRef.current?.focus(); narrativeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return }
    if (!canSave) return
    const occurredAt = occurrence.capture()
    if (!occurredAt) return
    setSaving(true); setPageError(''); setFieldErrors({})
    try {
      const details: JournalSymptomDetails = { symptomCategory: inferSymptomCategory(draft.keywords), narrative: draft.narrative, keywords: draft.keywords, locations: toSymptomLocations(draft.locations), descriptors: [], linkedRecordIds: {}, ...(draft.locationText.trim() ? { locationText: draft.locationText.trim() } : {}), ...(draft.impactLevel ? { impactLevel: draft.impactLevel } : {}), ...(draft.triggerText.trim() ? { triggerText: draft.triggerText.trim() } : {}), ...(draft.trend ? { trend: draft.trend } : {}), ...(draft.shortNote.trim() ? { shortNote: draft.shortNote.trim() } : {}) }
      if (draft.summary.trim()) details.generatedSummary = draft.summary.trim()
      const message = await onConfirm(draft.narrative.trim(), occurredAt, 'text', photos.payload(), { categories: ['symptom'], symptom: details, occurredAt, timePrecision: 'exact' })
      photos.clearAfterSave(); sessionStorage.removeItem(draftKey(memberId)); onSaved(message); onClose()
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '保存失败，请重试'
      if (message.includes('主要症状') || message.includes('其他症状')) setFieldErrors((current) => ({ ...current, narrative: '请填写哪里不舒服' }))
      else setPageError(message)
    } finally { setSaving(false) }
  }
  const optionalSummary = symptomOptionalSummary(draft)
  const manualLocation = draft.locationText.trim()
  const manualLocationIsStructured = draft.locations.some((location) => location.label.trim() === manualLocation)
  return <div className="symptom-record-page-layer"><section aria-label="记录症状" aria-modal="true" className="symptom-record-page symptom-record-page--brand-white" role="dialog">
    <header><button aria-label="返回" disabled={saving} onClick={() => leave(onBack)} type="button"><ChevronLeft aria-hidden="true" size={24} strokeWidth={1.8} /></button><h1>记录症状</h1><button aria-label="关闭" disabled={saving} onClick={() => leave(onClose)} type="button"><X aria-hidden="true" size={23} strokeWidth={1.8} /></button></header>
    <div className="symptom-record-scroll">
      <section className="symptom-card symptom-narrative"><div className="symptom-heading"><h2>哪里不舒服？</h2></div><textarea ref={narrativeRef} aria-describedby={fieldErrors.narrative ? 'symptom-narrative-error' : undefined} aria-invalid={Boolean(fieldErrors.narrative)} aria-label="哪里不舒服" maxLength={1000} onBlur={() => { if (narrativeRef.current) narrativeRef.current.scrollTop = 0 }} onChange={(event) => updateNarrative(event.target.value)} onCompositionEnd={(event) => { setComposing(false); updateNarrative(event.currentTarget.value) }} onCompositionStart={() => { previewVersionRef.current += 1; setComposing(true); setRecognition('idle') }} placeholder="描述症状和变化，例如：左肘窝发红、发痒" value={draft.narrative} />{fieldErrors.narrative && <p className="symptom-field-error" id="symptom-narrative-error" role="alert">{fieldErrors.narrative}</p>}{recognition === 'loading' && <p className="symptom-extraction-note" role="status">正在整理症状描述…</p>}{recognition === 'success' && <p className="symptom-extraction-note" role="status">已整理，可继续修改</p>}{recognition === 'empty' && <p className="symptom-extraction-note">暂未生成摘要，可直接保存原文。</p>}{recognition === 'error' && <p className="symptom-extraction-note">暂时无法整理，可直接保存原文。</p>}{draft.keywords.length > 0 && <div className="symptom-keywords">{draft.keywords.map((keyword) => <button aria-label={`移除${keyword}`} key={keyword} onClick={() => update('keywords', draft.keywords.filter((item) => item !== keyword))} type="button">{keyword}<X aria-hidden="true" size={12} /></button>)}</div>}</section>
      <section className="symptom-card symptom-location-card"><div className="symptom-card-heading"><h2><MapPin aria-hidden="true" size={21} strokeWidth={1.8} />症状部位 <span>选填</span></h2><ChildBodyLocationPicker memberId={memberId} showCommitted={false} buttonLabel={draft.locations.length ? '修改' : '选择部位'} confirmLabel="完成并返回症状记录" value={draft.locations} onChange={(locations) => { locationEditedRef.current = true; setDraft((current) => ({ ...current, locations })); setPageError('') }} /></div>{draft.locations.length || manualLocation ? <div aria-label="已选择的症状部位" className="symptom-location-tags">{draft.locations.map((location, index) => <span key={childSelectionKey(location)}><Check aria-hidden="true" size={15} />{location.label}{draft.locations.length > 1 ? ` · ${index + 1}号区域` : ''}</span>)}{manualLocation && !manualLocationIsStructured && <span><Check aria-hidden="true" size={15} />{manualLocation}</span>}</div> : <p className="symptom-card-empty">尚未选择部位</p>}<label className="symptom-manual-location"><span>手动补充部位</span><input aria-label="手动补充症状部位" maxLength={120} onChange={(event) => { locationEditedRef.current = true; update('locationText', event.target.value) }} placeholder="例如：左肘窝" value={draft.locationText} /></label></section>
      <section className={`symptom-card symptom-photo-section${photos.photos.length ? ' is-expanded' : ''}`}><button className="symptom-card-action" onClick={() => photoInputRef.current?.click()} type="button"><strong><Paperclip aria-hidden="true" size={21} strokeWidth={1.8} />照片与附件</strong><span>{photos.photos.length ? `${photos.photos.length} 张照片` : '添加'}<Plus aria-hidden="true" size={18} strokeWidth={1.8} /></span></button>{photos.photos.length > 0 && <QuickRecordPhotos limit={6} model={photos} showAddButton={false} />}</section>
      <section className={`symptom-card symptom-supplement-card${optionalOpen ? ' is-expanded' : ''}`}><button aria-expanded={optionalOpen} className="symptom-card-action" onClick={() => setOptionalOpen((value) => !value)} type="button"><strong><SlidersHorizontal aria-hidden="true" size={21} strokeWidth={1.8} />补充信息</strong><span>{optionalOpen ? '收起' : '展开'}<ChevronDown aria-hidden="true" className={optionalOpen ? 'is-open' : ''} size={18} /></span></button>{!optionalOpen && <p className={`symptom-supplement-summary${optionalSummary ? ' has-value' : ''}`}>{optionalSummary || '严重程度、诱因、变化、备注'}</p>}{optionalOpen && <div className="symptom-optional-fields">
        <fieldset><legend>严重程度</legend><div className="symptom-segmented-options">{impactOptions.map(([value, label]) => <button aria-pressed={draft.impactLevel === value} key={value} onClick={() => update('impactLevel', draft.impactLevel === value ? undefined : value)} type="button">{draft.impactLevel === value && <Check aria-hidden="true" size={15} />}{label}</button>)}</div></fieldset>
        <label><span>触发或诱因</span><input maxLength={160} onChange={(event) => update('triggerText', event.target.value)} value={draft.triggerText} /></label>
        <fieldset><legend>症状变化</legend><div className="symptom-segmented-options">{trendOptions.map(([value, label]) => <button aria-pressed={draft.trend === value} key={value} onClick={() => update('trend', draft.trend === value ? undefined : value)} type="button">{draft.trend === value && <Check aria-hidden="true" size={15} />}{label}</button>)}</div>{draft.trend && !trendOptions.some(([value]) => value === draft.trend) && <p className="symptom-legacy-value">已保留：{trendLabels[draft.trend] ?? draft.trend}</p>}</fieldset>
        <label><span>备注</span><textarea maxLength={160} onChange={(event) => update('shortNote', event.target.value)} placeholder="还有什么需要补充？" value={draft.shortNote} /></label>
      </div>}</section>
      <OccurrenceTimeField model={occurrence} label="发生时间" labelIcon={<Clock3 aria-hidden="true" size={21} strokeWidth={1.8} />} onValueChange={(value) => update('occurredAt', value || undefined)} showDateContext />
      {pageError && <p className="symptom-save-error" role="alert">{pageError}</p>}{photos.blocked && <p className="symptom-save-error" role="alert">{photos.photos.some((photo) => photo.status === 'failed') ? '有照片上传失败，请重试或移除' : '照片上传中，请稍候'}</p>}
    </div>
    <div className="symptom-record-save"><HohoButton disabled={saving || photos.blocked} fullWidth loading={saving} onClick={() => void save()} size="large">保存</HohoButton></div>
    <input ref={photoInputRef} accept="image/*" hidden multiple onChange={(event) => { photos.chooseFiles(event.target.files); event.currentTarget.value = '' }} type="file" />
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

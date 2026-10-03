import { bodyLocationLabel } from '../../../shared/body-location-label.mjs'
import { Check, ChevronDown, ChevronLeft, Clock3, MapPin, Mic, Camera, Video, Cross, ClipboardPlus, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { ChildBodyLocationPicker } from '../../components/health/body-location/ChildBodyLocationPicker'
import { childSelectionKey } from '../../features/body-location/childBodyCatalog'
import type { BodyLocationSelection } from '../../features/body-location'
import type { JournalMetadata, JournalSymptomDetails, SymptomImpactLevel } from '../../types/journal'
import { localDateTimeToIso } from '../../utils/healthOccurredAt'
import { symptomPreviewService } from '../../services/symptomPreview'
import { QuickRecordPhotos, useQuickRecordPhotos, type QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { inferSymptomCategory, toSymptomLocations } from './symptomRecordLogic'
import { useSymptomVoice } from './useSymptomVoice'
import { journalCategoryLabels, journalListSummary, type JournalEntry } from './timeViewModel'
import { OccurrenceTimeField, useOccurrenceTime } from './OccurrenceTimeField'
import './TimeView.css'
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

const impactOptions: readonly [SymptomImpactLevel, string][] = [['little', '轻度'], ['some', '中度'], ['clear', '重度']]

export function SymptomRecordFlow({ memberId, token, selectedDay, today, onBack, onClose, onConfirm, onSaved, title = '记录症状', draftScope = memberId, extraFields }: { memberId: string; token: string; selectedDay: string; today: string; onBack: () => void; onClose: () => void; onConfirm: SaveRecord; onSaved: (message: string) => void; title?: string; draftScope?: string; extraFields?: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(() => restoreDraft(draftScope))
  const [saving, setSaving] = useState(false), [pageError, setPageError] = useState('')
  const [recognition, setRecognition] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle')
  const [fieldErrors, setFieldErrors] = useState<{ narrative?: string; location?: string; time?: string }>({})
  const [optionalOpen, setOptionalOpen] = useState(false), [composing, setComposing] = useState(false)
  const videoInputRef = useRef<HTMLInputElement>(null), photoInputRef = useRef<HTMLInputElement>(null), narrativeRef = useRef<HTMLTextAreaElement>(null)
  const locationEditedRef = useRef(Boolean(draft.locationText || draft.locations.length))
  const previewVersionRef = useRef(0)
  const photos = useQuickRecordPhotos(memberId, token, 6, draftScope === memberId ? 'symptom' : `symptom:${draftScope}`, true)
  const occurrence = useOccurrenceTime(selectedDay, today, draft.occurredAt)
  const [viewport, setViewport] = useState(() => ({ top: window.visualViewport?.offsetTop ?? 0, height: window.visualViewport?.height ?? window.innerHeight }))
  useEffect(() => {
    const body = document.body, previous = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow }, scrollY = window.scrollY
    body.style.position = 'fixed'; body.style.top = `${-scrollY}px`; body.style.width = '100%'; body.style.overflow = 'hidden'
    const visual = window.visualViewport
    const resize = () => setViewport({ top: visual?.offsetTop ?? 0, height: visual?.height ?? window.innerHeight })
    window.addEventListener('resize', resize); visual?.addEventListener('resize', resize); visual?.addEventListener('scroll', resize)
    return () => { Object.assign(body.style, previous); window.scrollTo(0, scrollY); window.removeEventListener('resize', resize); visual?.removeEventListener('resize', resize); visual?.removeEventListener('scroll', resize) }
  }, [])
  useEffect(() => { sessionStorage.setItem(draftKey(draftScope), JSON.stringify(draft)) }, [draft, draftScope])
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
  const voice = useSymptomVoice(draft.narrative, updateNarrative)
  const canSave = Boolean(draft.narrative.trim() && !photos.blocked)
  const isDirty = Boolean(draft.narrative.trim() || draft.summary.trim() || draft.locationText.trim() || draft.locations.length || draft.triggerText.trim() || draft.impactLevel || draft.trend || draft.shortNote.trim() || draft.occurredAt || photos.photos.length)
  const leave = (action: () => void) => { if (!isDirty || window.confirm('这条症状还没有保存，确定退出吗？')) action() }
  const save = async () => {
    if (saving || voice.busy) return
    if (!draft.narrative.trim()) { setFieldErrors((current) => ({ ...current, narrative: '请填写哪里不舒服' })); narrativeRef.current?.focus(); narrativeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return }
    if (!canSave) return
    const occurredAt = occurrence.capture()
    if (!occurredAt) return
    setSaving(true); setPageError(''); setFieldErrors({})
    try {
      const details: JournalSymptomDetails = { symptomCategory: inferSymptomCategory(draft.keywords), narrative: draft.narrative, keywords: draft.keywords, locations: toSymptomLocations(draft.locations), descriptors: [], linkedRecordIds: {}, ...(draft.locationText.trim() ? { locationText: draft.locationText.trim() } : {}), ...(draft.impactLevel ? { impactLevel: draft.impactLevel } : {}), ...(draft.triggerText.trim() ? { triggerText: draft.triggerText.trim() } : {}), ...(draft.trend ? { trend: draft.trend } : {}), ...(draft.shortNote.trim() ? { shortNote: draft.shortNote.trim() } : {}) }
      if (draft.summary.trim()) details.generatedSummary = draft.summary.trim()
      const message = await onConfirm(draft.narrative.trim(), occurredAt, 'text', photos.payload(), { categories: ['symptom'], symptom: details, occurredAt, timePrecision: 'exact' })
      photos.clearAfterSave(); sessionStorage.removeItem(draftKey(draftScope)); onSaved(message); onClose()
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '保存失败，请重试'
      if (message.includes('主要症状') || message.includes('其他症状')) setFieldErrors((current) => ({ ...current, narrative: '请填写哪里不舒服' }))
      else setPageError(message)
    } finally { setSaving(false) }
  }
  const manualLocation = draft.locationText.trim()
  const manualLocationIsStructured = draft.locations.some((location) => location.label.trim() === manualLocation)
  return createPortal(<div className="symptom-record-page-layer" style={{ top: viewport.top, height: viewport.height, bottom: 'auto' }}><section aria-label={title} aria-modal="true" className="symptom-record-page symptom-record-page--brand-white" role="dialog">
    <header><button aria-label="返回" disabled={saving} onClick={() => leave(onBack)} type="button"><ChevronLeft aria-hidden="true" size={24} strokeWidth={1.8} /></button><h1>{title}</h1></header>
    <div className="symptom-record-scroll">
      <section className="symptom-card symptom-narrative"><div className="symptom-heading"><h2 aria-label="症状描述（主诉）"><Cross aria-hidden="true" size={21} strokeWidth={1.8} />症状描述<span>（主诉）</span></h2></div>{voice.busy && <p className="symptom-extraction-note" role="status">{voice.state === 'requesting' ? '正在请求麦克风…' : voice.state === 'stopping' ? '正在结束语音…' : '正在聆听，讲话会实时转成文字'}</p>}{voice.error && <p className="symptom-field-error" role="alert">{voice.error}</p>}<textarea ref={narrativeRef} aria-describedby={fieldErrors.narrative ? 'symptom-narrative-error' : undefined} aria-invalid={Boolean(fieldErrors.narrative)} aria-label="哪里不舒服" maxLength={1000} readOnly={voice.busy} onBlur={() => { if (narrativeRef.current) narrativeRef.current.scrollTop = 0 }} onChange={(event) => updateNarrative(event.target.value)} onCompositionEnd={(event) => { setComposing(false); updateNarrative(event.currentTarget.value) }} onCompositionStart={() => { previewVersionRef.current += 1; setComposing(true); setRecognition('idle') }} placeholder="描述症状和变化，例如：左肘窝发红、发痒" value={draft.narrative} />{fieldErrors.narrative && <p className="symptom-field-error" id="symptom-narrative-error" role="alert">{fieldErrors.narrative}</p>}{recognition === 'loading' && <p className="symptom-extraction-note" role="status">正在整理症状描述…</p>}{recognition === 'success' && <p className="symptom-extraction-note" role="status">已整理，可继续修改</p>}{recognition === 'empty' && <p className="symptom-extraction-note">暂未生成摘要，可直接保存原文。</p>}{recognition === 'error' && <p className="symptom-extraction-note">暂时无法整理，可直接保存原文。</p>}{draft.keywords.length > 0 && <div className="symptom-keywords">{draft.keywords.map((keyword) => <button aria-label={`移除${keyword}`} key={keyword} onClick={() => update('keywords', draft.keywords.filter((item) => item !== keyword))} type="button">{keyword}<X aria-hidden="true" size={12} /></button>)}</div>}</section>
      <section aria-label="记录输入方式" className="symptom-media-actions"><button disabled={saving} onClick={() => videoInputRef.current?.click()} type="button"><Video aria-hidden="true" size={21} strokeWidth={1.8} />传视频</button><button disabled={saving} onClick={() => photoInputRef.current?.click()} type="button"><Camera aria-hidden="true" size={21} strokeWidth={1.8} />传照片</button><button className="symptom-voice-action" disabled={saving || voice.state === 'stopping'} onClick={() => voice.busy ? voice.stop() : void voice.start()} type="button"><Mic aria-hidden="true" size={21} />{voice.busy ? '结束' : '语音输入'}</button></section>
      {(photos.photos.length > 0 || photos.notice) && <div className="symptom-media-previews"><QuickRecordPhotos limit={6} model={photos} showAddButton={false} /></div>}
      <section className="symptom-card symptom-location-card"><div className="symptom-card-heading"><h2><MapPin aria-hidden="true" size={21} strokeWidth={1.8} />症状部位</h2></div><div className="symptom-location-entry"><input aria-label="手动补充症状部位" maxLength={120} onChange={(event) => { locationEditedRef.current = true; update('locationText', event.target.value) }} placeholder="例如：左肘窝" value={draft.locationText} /><ChildBodyLocationPicker memberId={memberId} showCommitted={false} buttonLabel={draft.locations.length ? '修改' : '选择部位'} confirmLabel="完成并返回症状记录" value={draft.locations} onChange={(locations) => { locationEditedRef.current = true; setDraft((current) => ({ ...current, locations })); setPageError('') }} /></div>{Boolean(draft.locations.length || manualLocation) && <div aria-label="已选择的症状部位" className="symptom-location-tags">{draft.locations.map((location) => <span key={childSelectionKey(location)}><Check aria-hidden="true" size={15} />{bodyLocationLabel(location)}</span>)}{manualLocation && !manualLocationIsStructured && <span><Check aria-hidden="true" size={15} />{manualLocation}</span>}</div>}</section>
      <section className={`symptom-card symptom-supplement-card${optionalOpen ? ' is-expanded' : ''}`}><button aria-expanded={optionalOpen} className="symptom-card-action" onClick={() => setOptionalOpen((value) => !value)} type="button"><strong><ClipboardPlus aria-hidden="true" size={21} strokeWidth={1.8} />补充信息</strong><span>{optionalOpen ? '收起' : '展开'}<ChevronDown aria-hidden="true" className={optionalOpen ? 'is-open' : ''} size={18} /></span></button>{optionalOpen && <div className="symptom-optional-fields">
        <fieldset><legend>严重程度</legend><div className="symptom-segmented-options">{impactOptions.map(([value, label]) => <button aria-pressed={draft.impactLevel === value} key={value} onClick={() => update('impactLevel', draft.impactLevel === value ? undefined : value)} type="button">{draft.impactLevel === value && <Check aria-hidden="true" size={15} />}{label}</button>)}</div></fieldset>
      </div>}</section>
      <OccurrenceTimeField model={occurrence} label="发生时间" labelIcon={<Clock3 aria-hidden="true" size={21} strokeWidth={1.8} />} onValueChange={(value) => update('occurredAt', value || undefined)} showDateContext />
      {extraFields}
      {pageError && <p className="symptom-save-error" role="alert">{pageError}</p>}{photos.blocked && <p className="symptom-save-error" role="alert">{photos.photos.some((photo) => photo.status === 'failed') ? '有照片上传失败，请重试或移除' : '照片上传中，请稍候'}</p>}
    </div>
    <div className="symptom-record-save"><HohoButton disabled={saving || voice.busy || photos.blocked} fullWidth loading={saving} onClick={() => void save()} size="large">保存</HohoButton></div>
    <input ref={videoInputRef} aria-label="选择视频" accept="video/mp4,video/quicktime,video/webm" hidden multiple onChange={(event) => { photos.chooseFiles(event.target.files); event.currentTarget.value = '' }} type="file" />
    <input aria-label="选择照片" ref={photoInputRef} accept="image/*" hidden multiple onChange={(event) => { photos.chooseFiles(event.target.files); event.currentTarget.value = '' }} type="file" />
  </section></div>, document.body)
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

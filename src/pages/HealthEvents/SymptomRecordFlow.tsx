import { ArrowLeft, Camera, Check, ChevronLeft, ChevronRight, ImagePlus, Mic, Paperclip, PersonStanding, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { BodyLocationPicker } from '../../components/health'
import type { BodyLocationSelection } from '../../features/body-location'
import type { JournalMetadata, JournalSymptomDetails, SymptomImpactLevel } from '../../types/journal'
import { localDateTimeToIso, localDateTimeValue } from '../../utils/healthOccurredAt'
import { QuickRecordPhotos, useQuickRecordPhotos, type QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { extractSymptomNarrative, generateSymptomSummary, inferSymptomCategory, toSymptomLocations } from './symptomRecordLogic'
import { journalCategoryLabels, journalListSummary, type JournalEntry } from './timeViewModel'
import { useJournal } from './useJournal'

type SaveRecord = (content: string, occurredAt: string, channel: 'text', photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>
type SupplementKey = 'diet' | 'elimination' | 'medication' | 'visit'
export type SymptomLinkedRecordIds = Partial<Record<SupplementKey, string[]>>
interface Draft {
  narrative: string; keywords: string[]; locationText: string; locations: BodyLocationSelection[]; occurredAt: string
  linkedRecordIds: SymptomLinkedRecordIds; impactLevel?: SymptomImpactLevel; triggerText: string
  trend?: JournalSymptomDetails['trend']; shortNote: string
}
const newDraft = (): Draft => ({ narrative: '', keywords: [], locationText: '', locations: [], occurredAt: localDateTimeValue(), linkedRecordIds: {}, triggerText: '', shortNote: '' })
const draftKey = (memberId: string) => `hoooho-symptom-record-draft:${memberId}`
const supplementLabels: Record<SupplementKey, string> = { diet: '进食', elimination: '排便', medication: '用药', visit: '就医' }
const supplementCategory: Record<SupplementKey, string> = { diet: 'diet', elimination: 'elimination', medication: 'medication', visit: 'visit' }

function restoreDraft(memberId: string) {
  const fresh = newDraft()
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey(memberId)) || '{}') as Partial<Draft>
    const hasUserContent = Boolean(saved.narrative?.trim() || saved.locationText?.trim() || saved.locations?.length || Object.values(saved.linkedRecordIds ?? {}).some((ids) => ids?.length) || saved.triggerText?.trim() || saved.shortNote?.trim() || saved.impactLevel || saved.trend)
    return hasUserContent ? { ...fresh, ...saved, linkedRecordIds: saved.linkedRecordIds ?? {} } : fresh
  } catch { return fresh }
}

function selectedCount(linked: Draft['linkedRecordIds']) { return Object.values(linked).reduce((sum, ids) => sum + (ids?.length ?? 0), 0) }

export function SymptomRecordFlow({ memberId, token, onBack, onClose, onConfirm, onSaved }: { memberId: string; token: string; onBack: () => void; onClose: () => void; onConfirm: SaveRecord; onSaved: (message: string) => void }) {
  const [draft, setDraft] = useState<Draft>(() => restoreDraft(memberId))
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [extracted, setExtracted] = useState(false)
  const [attachmentOpen, setAttachmentOpen] = useState(false), [relatedOpen, setRelatedOpen] = useState(false), [optionalOpen, setOptionalOpen] = useState(false), [listening, setListening] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null), albumRef = useRef<HTMLInputElement>(null), narrativeRef = useRef<HTMLTextAreaElement>(null)
  const photos = useQuickRecordPhotos(memberId, token, 6, 'symptom')
  const journal = useJournal(memberId, token, 0)
  useEffect(() => { sessionStorage.setItem(draftKey(memberId), JSON.stringify(draft)) }, [draft, memberId])
  useEffect(() => {
    if (!draft.narrative.trim()) { setDraft((current) => current.keywords.length ? { ...current, keywords: [] } : current); setExtracted(false); return }
    const timer = window.setTimeout(() => { const result = extractSymptomNarrative(draft.narrative); setDraft((current) => ({ ...current, keywords: result.keywords, locationText: current.locationText || result.bodyLocation || '' })); setExtracted(Boolean(result.keywords.length || result.bodyLocation || result.occurredAtText)) }, 350)
    return () => window.clearTimeout(timer)
  }, [draft.narrative])
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft((current) => ({ ...current, [key]: value })); setError('') }
  const validTime = Boolean(draft.occurredAt && Number.isFinite(Date.parse(draft.occurredAt)) && Date.parse(draft.occurredAt) <= Date.now())
  const canSave = Boolean(draft.narrative.trim() && validTime && !photos.blocked)
  const isDirty = Boolean(draft.narrative.trim() || draft.locationText.trim() || draft.locations.length || selectedCount(draft.linkedRecordIds) || draft.triggerText.trim() || draft.shortNote.trim() || photos.photos.length)
  const leave = (action: () => void) => { if (!isDirty || window.confirm('这条症状还没有保存，确定退出吗？')) action() }
  const startVoice = () => {
    type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: (event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void; onend: () => void; onerror: () => void; start: () => void }
    const speechWindow = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }; const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) { setError('当前浏览器暂不支持语音输入，可以直接输入文字'); return }
    const recognition = new Recognition(); recognition.lang = 'zh-CN'; recognition.continuous = false; recognition.interimResults = false
    recognition.onresult = (event) => update('narrative', `${draft.narrative}${draft.narrative ? '，' : ''}${event.results[0][0].transcript}`); recognition.onend = () => setListening(false); recognition.onerror = () => { setListening(false); setError('没有听清，可以重试或直接输入文字') }; setListening(true); recognition.start()
  }
  const save = async () => {
    if (!canSave || saving) return
    setSaving(true); setError('')
    try {
      const details: JournalSymptomDetails = { symptomCategory: inferSymptomCategory(draft.keywords), narrative: draft.narrative, keywords: draft.keywords, locations: toSymptomLocations(draft.locations), descriptors: [], linkedRecordIds: draft.linkedRecordIds, ...(draft.locationText.trim() ? { locationText: draft.locationText.trim() } : {}), ...(draft.impactLevel ? { impactLevel: draft.impactLevel } : {}), ...(draft.triggerText.trim() ? { triggerText: draft.triggerText.trim() } : {}), ...(draft.trend ? { trend: draft.trend } : {}), ...(draft.shortNote.trim() ? { shortNote: draft.shortNote.trim() } : {}) }
      details.generatedSummary = generateSymptomSummary(details, photos.photos.length)
      const occurredAt = localDateTimeToIso(draft.occurredAt)
      const message = await onConfirm(details.generatedSummary, occurredAt, 'text', photos.payload(), { categories: ['symptom'], symptom: details, occurredAt, timePrecision: 'exact' })
      photos.clearAfterSave(); sessionStorage.removeItem(draftKey(memberId)); onSaved(message); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') } finally { setSaving(false) }
  }
  const selectedLocation = draft.locations[0]
  return <div className="symptom-record-page-layer"><section aria-label="记录症状" aria-modal="true" className="symptom-record-page" role="dialog">
    <header><button aria-label="返回" disabled={saving} onClick={() => leave(onBack)} type="button"><ArrowLeft size={22} /></button><h1>记录症状</h1><button aria-label="关闭" disabled={saving} onClick={() => leave(onClose)} type="button"><X size={21} /></button></header>
    <div className="symptom-record-scroll">
      <section className="symptom-narrative"><div className="symptom-heading"><h2>症状描述</h2><button aria-label="语音输入症状" className={listening ? 'is-listening' : ''} onClick={startVoice} type="button"><Mic size={19} /></button></div><textarea ref={narrativeRef} aria-label="症状描述" autoFocus maxLength={1000} onBlur={() => { if (narrativeRef.current) narrativeRef.current.scrollTop = 0 }} onChange={(event) => update('narrative', event.target.value)} placeholder="描述哪里不舒服、有什么变化" value={draft.narrative} />{extracted && <p className="symptom-extraction-note">已从描述中提取</p>}{draft.keywords.length > 0 && <div className="symptom-keywords">{draft.keywords.map((keyword) => <button aria-label={`移除${keyword}`} key={keyword} onClick={() => update('keywords', draft.keywords.filter((item) => item !== keyword))} type="button">{keyword}<X size={12} /></button>)}</div>}</section>
      <section className="symptom-location-compact"><div className="symptom-heading"><h2>症状部位</h2></div><div className="symptom-location-input"><input aria-label="症状部位" maxLength={120} onChange={(event) => update('locationText', event.target.value)} placeholder="例如：左肘窝" value={draft.locationText} /><BodyLocationPicker buttonLabel={selectedLocation ? '修改' : '定位'} compact label="" showEmptyState={false} value={draft.locations} onChange={(locations) => { setDraft((current) => ({ ...current, locations, locationText: locations[0]?.label ?? current.locationText })); setError('') }} /></div>{selectedLocation && <div className="symptom-location-preview"><span aria-hidden="true" className="symptom-location-silhouette"><PersonStanding size={34} strokeWidth={1.35} /><i>1</i></span><span><strong>{selectedLocation.label} · 1号区域</strong><small>{`身体${selectedLocation.locationType === 'surface' ? '表面' : '内部'} · ${selectedLocation.view === 'back' ? '背面' : '正面'}`}</small></span></div>}</section>
      <div className="symptom-compact-grid">
        <section className={`symptom-compact-row${photos.photos.length ? ' is-expanded' : ''}`}><button onClick={() => setAttachmentOpen(true)} type="button"><span><Paperclip size={19} /><strong>添加照片</strong></span><span>{photos.photos.length ? `${photos.photos.length}张` : null}<ChevronRight size={18} /></span></button>{photos.photos.length > 0 && <QuickRecordPhotos limit={6} model={photos} />}</section>
        <section className={`symptom-compact-row${optionalOpen ? ' is-expanded' : ''}`}><button onClick={() => setOptionalOpen((value) => !value)} type="button"><span><Plus size={19} /><strong>补充症状信息</strong><small>严重程度、诱因、变化、备注</small></span><span>{draft.impactLevel || draft.triggerText || draft.trend || draft.shortNote ? '已填写' : null}<ChevronRight className={optionalOpen ? 'is-open' : ''} size={18} /></span></button>{optionalOpen && <div className="symptom-optional-fields"><label><span>严重程度</span><select aria-label="严重程度" onChange={(event) => update('impactLevel', (event.target.value || undefined) as SymptomImpactLevel | undefined)} value={draft.impactLevel ?? ''}><option value="">未填写</option><option value="little">轻微</option><option value="some">有些影响</option><option value="clear">明显影响</option></select></label><label><span>触发或诱因</span><input maxLength={160} onChange={(event) => update('triggerText', event.target.value)} value={draft.triggerText} /></label><label><span>是否加重或减轻</span><select aria-label="是否加重或减轻" onChange={(event) => update('trend', (event.target.value || undefined) as JournalSymptomDetails['trend'])} value={draft.trend ?? ''}><option value="">未填写</option><option value="more_noticeable">加重了</option><option value="improving">减轻了</option><option value="same">没有明显变化</option><option value="recurrent">反复出现</option></select></label><label><span>备注</span><textarea maxLength={160} onChange={(event) => update('shortNote', event.target.value)} value={draft.shortNote} /></label></div>}</section>
      </div>
      <section className="symptom-compact-row"><button onClick={() => setRelatedOpen(true)} type="button"><span><Plus size={19} /><strong>关联其他记录</strong><small>进食、排便、用药、就医</small></span><span>{selectedCount(draft.linkedRecordIds) ? `已关联 ${selectedCount(draft.linkedRecordIds)} 条` : '选填'}<ChevronRight size={18} /></span></button></section>
      <label className="symptom-time-row"><span>记录时间</span><input aria-label="记录时间" max={localDateTimeValue()} onChange={(event) => update('occurredAt', event.target.value)} type="datetime-local" value={draft.occurredAt} /></label>
      {error && <p className="symptom-save-error" role="alert">{error}</p>}<div className="symptom-record-save"><HohoButton disabled={!canSave || saving} fullWidth loading={saving} onClick={() => void save()} size="large">保存</HohoButton></div>
    </div>
    <BottomSheetSurface label="添加照片" onClose={() => setAttachmentOpen(false)} open={attachmentOpen} title="添加照片"><div className="symptom-attachment-options"><button onClick={() => cameraRef.current?.click()} type="button"><Camera size={22} /><span>拍照</span></button><button onClick={() => albumRef.current?.click()} type="button"><ImagePlus size={22} /><span>从相册选择</span></button></div></BottomSheetSurface>
    <input ref={cameraRef} accept="image/*" capture="environment" hidden onChange={(event) => { photos.chooseFiles(event.target.files); event.currentTarget.value = ''; setAttachmentOpen(false) }} type="file" /><input ref={albumRef} accept="image/jpeg,image/png,image/webp" hidden multiple onChange={(event) => { photos.chooseFiles(event.target.files); event.currentTarget.value = ''; setAttachmentOpen(false) }} type="file" />
    <RelatedRecordsSheet entries={journal.entries} error={journal.error} linked={draft.linkedRecordIds} loading={journal.loading} onChange={(value) => update('linkedRecordIds', value)} onClose={() => setRelatedOpen(false)} onRetry={journal.retry} open={relatedOpen} />
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

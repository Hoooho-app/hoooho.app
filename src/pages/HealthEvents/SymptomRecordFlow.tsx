import { ArrowLeft, Camera, ChevronRight, ImagePlus, Mic, Paperclip, PersonStanding, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import { BodyLocationPicker } from '../../components/health'
import type { BodyLocationSelection } from '../../features/body-location'
import type { JournalMetadata, JournalSymptomDetails } from '../../types/journal'
import { localDateTimeValue } from '../../utils/healthOccurredAt'
import { QuickRecordPhotos, useQuickRecordPhotos, type QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { extractSymptomNarrative, generateSymptomSummary, inferSymptomCategory, toSymptomLocations } from './symptomRecordLogic'

type SaveRecord = (content: string, occurredAt: string, channel: 'text', photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>
type SupplementKey = 'diet' | 'elimination' | 'medication' | 'visit'
interface Draft { narrative: string; keywords: string[]; locationText: string; locations: BodyLocationSelection[]; occurredAt: string; supplementalCounts: Partial<Record<SupplementKey, number>> }
const newDraft = (): Draft => ({ narrative: '', keywords: [], locationText: '', locations: [], occurredAt: localDateTimeValue(), supplementalCounts: {} })
const draftKey = (memberId: string) => `hoooho-symptom-record-draft:${memberId}`
const supplementLabels: Record<SupplementKey, string> = { diet: '进食', elimination: '排便', medication: '用药', visit: '就医' }

export function SymptomRecordFlow({ memberId, token, onBack, onClose, onConfirm, onSaved }: { memberId: string; token: string; onBack: () => void; onClose: () => void; onConfirm: SaveRecord; onSaved: (message: string) => void }) {
  const [draft, setDraft] = useState<Draft>(() => { try { return { ...newDraft(), ...JSON.parse(sessionStorage.getItem(draftKey(memberId)) || '{}') } } catch { return newDraft() } })
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [extracted, setExtracted] = useState(false)
  const [attachmentOpen, setAttachmentOpen] = useState(false), [supplementOpen, setSupplementOpen] = useState(false), [listening, setListening] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null), albumRef = useRef<HTMLInputElement>(null)
  const photos = useQuickRecordPhotos(memberId, token, 6, 'symptom')
  useEffect(() => { sessionStorage.setItem(draftKey(memberId), JSON.stringify(draft)) }, [draft, memberId])
  useEffect(() => {
    if (!draft.narrative.trim()) { setExtracted(false); return }
    const timer = window.setTimeout(() => { const result = extractSymptomNarrative(draft.narrative); setDraft((current) => ({ ...current, keywords: result.keywords, locationText: current.locationText || result.bodyLocation || '' })); setExtracted(Boolean(result.keywords.length || result.bodyLocation || result.occurredAtText)) }, 350)
    return () => window.clearTimeout(timer)
  }, [draft.narrative])
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft((current) => ({ ...current, [key]: value })); setError('') }
  const validTime = Boolean(draft.occurredAt && Number.isFinite(Date.parse(draft.occurredAt)) && Date.parse(draft.occurredAt) <= Date.now())
  const canSave = Boolean(draft.narrative.trim() && validTime && !photos.blocked)
  const startVoice = () => {
    type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: (event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void; onend: () => void; onerror: () => void; start: () => void }
    const speechWindow = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) { setError('当前浏览器暂不支持语音输入，可以直接输入文字'); return }
    const recognition = new Recognition(); recognition.lang = 'zh-CN'; recognition.continuous = false; recognition.interimResults = false
    recognition.onresult = (event) => update('narrative', `${draft.narrative}${draft.narrative ? '，' : ''}${event.results[0][0].transcript}`)
    recognition.onend = () => setListening(false); recognition.onerror = () => { setListening(false); setError('没有听清，可以重试或直接输入文字') }; setListening(true); recognition.start()
  }
  const save = async () => {
    if (!canSave || saving) { setError('请填写主要症状，并检查记录时间'); return }
    setSaving(true); setError('')
    try {
      const details: JournalSymptomDetails = { symptomCategory: inferSymptomCategory(draft.keywords), narrative: draft.narrative.trim(), keywords: draft.keywords, locations: toSymptomLocations(draft.locations), descriptors: [], ...(draft.locationText.trim() ? { locationText: draft.locationText.trim() } : {}), ...(Object.values(draft.supplementalCounts).some(Boolean) ? { supplementalCounts: draft.supplementalCounts } : {}) }
      details.generatedSummary = generateSymptomSummary(details, photos.photos.length)
      const occurredAt = new Date(draft.occurredAt).toISOString()
      const message = await onConfirm(details.generatedSummary, occurredAt, 'text', photos.payload(), { categories: ['symptom'], symptom: details, occurredAt, timePrecision: 'exact' })
      photos.clearAfterSave(); sessionStorage.removeItem(draftKey(memberId)); onSaved(message); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') } finally { setSaving(false) }
  }
  const selectedLocation = draft.locations[0]
  return <div className="symptom-record-page-layer"><section aria-label="记录症状" aria-modal="true" className="symptom-record-page" role="dialog">
    <header><button aria-label="返回" disabled={saving} onClick={onBack} type="button"><ArrowLeft size={22} /></button><h1>记录症状</h1><button aria-label="关闭" disabled={saving} onClick={onClose} type="button"><X size={21} /></button></header>
    <div className="symptom-record-scroll">
      <section className="symptom-narrative"><div className="symptom-heading"><h2>主要症状（主述）</h2><button aria-label="语音输入症状" className={listening ? 'is-listening' : ''} onClick={startVoice} type="button"><Mic size={19} /></button></div><textarea autoFocus maxLength={1000} onChange={(event) => update('narrative', event.target.value)} placeholder="请描述哪里不舒服、有什么变化" value={draft.narrative} />{extracted && <p className="symptom-extraction-note">已从主述填写</p>}{draft.keywords.length > 0 && <div className="symptom-keywords">{draft.keywords.map((keyword) => <button aria-label={`移除${keyword}`} key={keyword} onClick={() => update('keywords', draft.keywords.filter((item) => item !== keyword))} type="button">{keyword}<X size={12} /></button>)}</div>}</section>
      <section className="symptom-location-compact"><div className="symptom-heading"><h2>症状部位</h2></div><div className="symptom-location-input"><input maxLength={120} onChange={(event) => update('locationText', event.target.value)} placeholder="例如：左肘窝" value={draft.locationText} /><BodyLocationPicker buttonLabel={selectedLocation ? '修改' : '定位'} compact label="" showEmptyState={false} value={draft.locations} onChange={(locations) => { setDraft((current) => ({ ...current, locations, locationText: locations[0]?.label ?? current.locationText })); setError('') }} /></div>{selectedLocation && <div className="symptom-location-preview"><span aria-hidden="true" className="symptom-location-silhouette"><PersonStanding size={34} strokeWidth={1.35} /><i>1</i></span><span><strong>{selectedLocation.label} · 1号区域</strong><small>{`身体${selectedLocation.locationType === 'surface' ? '表面' : '内部'} · ${selectedLocation.view === 'back' ? '背面' : '正面'}`}</small></span></div>}</section>
      <section className="symptom-compact-row"><button onClick={() => setAttachmentOpen(true)} type="button"><span><Paperclip size={19} /><strong>添加照片</strong></span><span>{photos.photos.length ? `${photos.photos.length}张` : '选填'}<ChevronRight size={18} /></span></button>{photos.photos.length > 0 && <QuickRecordPhotos limit={6} model={photos} />}</section>
      <section className="symptom-compact-row"><button onClick={() => setSupplementOpen(true)} type="button"><span><Plus size={19} /><strong>补充更多</strong><small>进食、排便、用药、就医</small></span><span>{Object.values(draft.supplementalCounts).reduce((sum, count) => sum + (count ?? 0), 0) || '选填'}<ChevronRight size={18} /></span></button></section>
      <label className="symptom-time-row"><span>记录时间</span><input max={localDateTimeValue()} onChange={(event) => update('occurredAt', event.target.value)} type="datetime-local" value={draft.occurredAt} /></label>
      {error && <p className="symptom-save-error" role="alert">{error}</p>}<div className="symptom-record-save"><HohoButton disabled={!canSave || saving} fullWidth loading={saving} onClick={() => void save()} size="large">保存</HohoButton></div>
    </div>
    <BottomSheetSurface label="添加照片" onClose={() => setAttachmentOpen(false)} open={attachmentOpen} title="添加照片"><div className="symptom-attachment-options"><button onClick={() => cameraRef.current?.click()} type="button"><Camera size={22} /><span>拍照</span></button><button onClick={() => albumRef.current?.click()} type="button"><ImagePlus size={22} /><span>从相册选择</span></button></div></BottomSheetSurface>
    <input ref={cameraRef} accept="image/*" capture="environment" hidden onChange={(event) => { photos.chooseFiles(event.target.files); event.currentTarget.value = ''; setAttachmentOpen(false) }} type="file" /><input ref={albumRef} accept="image/jpeg,image/png,image/webp" hidden multiple onChange={(event) => { photos.chooseFiles(event.target.files); event.currentTarget.value = ''; setAttachmentOpen(false) }} type="file" />
    <BottomSheetSurface label="补充更多" onClose={() => setSupplementOpen(false)} open={supplementOpen} title="补充更多"><div className="symptom-supplement-tabs">{(Object.keys(supplementLabels) as SupplementKey[]).map((key) => <button className={(draft.supplementalCounts[key] ?? 0) > 0 ? 'is-added' : ''} key={key} onClick={() => update('supplementalCounts', { ...draft.supplementalCounts, [key]: (draft.supplementalCounts[key] ?? 0) ? 0 : 1 })} type="button"><span>{supplementLabels[key]}</span><small>{(draft.supplementalCounts[key] ?? 0) ? '已关联 1 条' : '点按关联'}</small></button>)}</div><HohoButton fullWidth onClick={() => setSupplementOpen(false)} size="large">完成</HohoButton></BottomSheetSurface>
  </section></div>
}

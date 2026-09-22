import { ArrowLeft, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ImagePlus, Mic, Paperclip, Plus, Square, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { BodyLocationPicker } from '../../components/health'
import type { BodyLocationSelection } from '../../features/body-location'
import type { JournalMetadata, JournalRelatedClue, JournalSaveResult, JournalSymptomDetails, SymptomImpactLevel } from '../../types/journal'
import { localDateTimeToIso, localDateTimeValue } from '../../utils/healthOccurredAt'
import { QuickRecordPhotos, useQuickRecordPhotos, type QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { RecordRelationSection, type RecordBackfillTarget } from './RecordRelationSection'
import { extractRelatedClues } from './recordRelations'
import { extractSymptomNarrative, generateSymptomSummary, inferSymptomCategory, toSymptomLocations } from './symptomRecordLogic'
import { JOURNAL_SAVED_FLASH_KEY, type LinkedBackfillResult } from './recordFlowTypes'
import { journalCategoryLabels, journalListSummary, type JournalEntry } from './timeViewModel'

type SaveRecord = (content: string, occurredAt: string, channel: 'text', photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<JournalSaveResult>
type LinkedRecordIds = NonNullable<JournalSymptomDetails['linkedRecordIds']>
export type SymptomLinkedRecordIds = LinkedRecordIds
interface Draft {
  narrative: string
  keywords: string[]
  locationText: string
  locations: BodyLocationSelection[]
  occurredAt: string
  linkedRecordIds: LinkedRecordIds
  impactLevel?: SymptomImpactLevel
  triggerText: string
  excludedClueIds: string[]
  summaryManuallyEdited: boolean
  locationManuallyEdited: boolean
}

const symptomGroups = {
  '皮肤与外观': ['发红', '红疹', '皮疹', '瘭痒', '肿胀', '起泡'],
  '体温与呼吸': ['发热', '咳嗽', '鼻塞', '流鼻涕', '呼吸不适'],
  '消化与排便': ['呕吐', '腹泻', '腹痛', '便秘', '大便颜色偏黑'],
  '疼痛与其他': ['头痛', '疼痛', '精神变差', '食欲变化'],
} as const
const newDraft = (): Draft => ({ narrative: '', keywords: [], locationText: '', locations: [], occurredAt: localDateTimeValue(), linkedRecordIds: {}, triggerText: '', excludedClueIds: [], summaryManuallyEdited: false, locationManuallyEdited: false })
const draftKey = (memberId: string) => `hoooho-symptom-record-draft:${memberId}`
const impactLabels: Record<SymptomImpactLevel, string> = { little: '较轻', some: '比较明显', clear: '较重' }
const impactValues: SymptomImpactLevel[] = ['little', 'some', 'clear']

function restoreDraft(memberId: string) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey(memberId)) || '{}') as Partial<Draft>
    return { ...newDraft(), ...saved, linkedRecordIds: saved.linkedRecordIds ?? {}, excludedClueIds: saved.excludedClueIds ?? [] }
  } catch { return newDraft() }
}

function selectedCount(linked: LinkedRecordIds) { return Object.values(linked).reduce((sum, ids) => sum + (ids?.length ?? 0), 0) }

export function SymptomRecordFlow({ memberId, token, linkedBackfill, navigateAfterSave = true, onBack, onClose, onBackfill, onConfirm, onSaved }: {
  memberId: string; token: string; onBack: () => void; onClose: () => void; onBackfill: (target: RecordBackfillTarget) => void
  linkedBackfill?: LinkedBackfillResult; navigateAfterSave?: boolean; onConfirm: SaveRecord; onSaved: (message: string) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => restoreDraft(memberId))
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState('')
  const [optionalOpen, setOptionalOpen] = useState(false)
  const [attachmentOpen, setAttachmentOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState('')
  const narrativeRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<{ stop?: () => void } | null>(null)
  const extractionVersionRef = useRef(0)
  const manualSummaryRef = useRef(draft.summaryManuallyEdited)
  const manualLocationRef = useRef(draft.locationManuallyEdited)
  const cameraRef = useRef<HTMLInputElement>(null)
  const albumRef = useRef<HTMLInputElement>(null)
  const photos = useQuickRecordPhotos(memberId, token, 6, 'symptom')

  useEffect(() => { sessionStorage.setItem(draftKey(memberId), JSON.stringify(draft)); manualSummaryRef.current = draft.summaryManuallyEdited; manualLocationRef.current = draft.locationManuallyEdited }, [draft, memberId])
  useEffect(() => {
    if (!linkedBackfill || !['daily', 'visit', 'medication'].includes(linkedBackfill.relation)) return
    setDraft((current) => {
      const key = linkedBackfill.relation as keyof LinkedRecordIds
      const ids = current.linkedRecordIds[key] ?? []
      return ids.includes(linkedBackfill.recordId) ? current : { ...current, linkedRecordIds: { ...current.linkedRecordIds, [key]: [...ids, linkedBackfill.recordId] } }
    })
  }, [linkedBackfill])
  useEffect(() => {
    const version = ++extractionVersionRef.current
    if (!draft.narrative.trim()) {
      setDraft((current) => ({ ...current, ...(current.summaryManuallyEdited ? {} : { keywords: [] }), ...(current.locationManuallyEdited ? {} : { locationText: '', locations: [] }), excludedClueIds: [] }))
      return
    }
    const timer = window.setTimeout(() => {
      const result = extractSymptomNarrative(draft.narrative)
      if (version !== extractionVersionRef.current) return
      setDraft((current) => ({ ...current, ...(!manualSummaryRef.current ? { keywords: result.keywords } : {}), ...(!manualLocationRef.current ? { locationText: result.bodyLocation ?? '', locations: [] } : {}), excludedClueIds: current.excludedClueIds.filter((id) => extractRelatedClues(current.narrative, current.triggerText).some((clue) => clue.id === id)) }))
    }, 320)
    return () => window.clearTimeout(timer)
  }, [draft.narrative])

  const allClues = useMemo(() => extractRelatedClues(draft.narrative, draft.triggerText), [draft.narrative, draft.triggerText])
  const clues = allClues.filter((clue) => !draft.excludedClueIds.includes(clue.id))
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft((current) => ({ ...current, [key]: value })); setPageError('') }
  const setLinks = (key: keyof LinkedRecordIds, ids: string[]) => update('linkedRecordIds', { ...draft.linkedRecordIds, [key]: ids })
  const validTime = Boolean(draft.occurredAt && Number.isFinite(Date.parse(draft.occurredAt)) && Date.parse(draft.occurredAt) <= Date.now())
  const isDirty = Boolean(draft.narrative.trim() || draft.keywords.length || draft.locations.length || draft.locationText.trim() || selectedCount(draft.linkedRecordIds) || draft.triggerText.trim() || photos.photos.length)
  const leave = (action: () => void) => { if (!isDirty || window.confirm('这条症状还没有保存，确定退出吗？')) action() }

  const startVoice = () => {
    if (listening) { recognitionRef.current?.stop?.(); return }
    type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: (event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void; onend: () => void; onerror: (event?: { error?: string }) => void; start: () => void; stop: () => void }
    const speechWindow = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) { setPageError('当前浏览器暂不支持语音输入，可以直接输入文字'); narrativeRef.current?.focus(); return }
    const recognition = new Recognition()
    recognition.lang = 'zh-CN'; recognition.continuous = true; recognition.interimResults = false
    recognition.onresult = (event) => { const text = event.results[event.results.length - 1]?.[0]?.transcript?.trim(); if (text) setDraft((current) => ({ ...current, narrative: `${current.narrative}${current.narrative ? '，' : ''}${text}` })) }
    recognition.onend = () => { setListening(false); setVoiceStatus('语音已停止，可以继续修改文字') }
    recognition.onerror = (event) => { setListening(false); setVoiceStatus(''); setPageError(event?.error === 'not-allowed' ? '未获得麦克风权限，已保留现有文字' : '语音识别失败，已保留现有文字') }
    recognitionRef.current = recognition; setListening(true); setVoiceStatus('正在听，点击“结束语音”停止'); setPageError('')
    try { recognition.start() } catch { setListening(false); setPageError('语音输入暂时无法启动，可以直接输入文字') }
  }

  const save = async () => {
    if (saving) return
    if (listening) recognitionRef.current?.stop?.()
    if (!draft.narrative.trim()) { setPageError('请先写下症状描述'); narrativeRef.current?.focus(); return }
    if (!validTime) { setPageError('记录时间不能晚于现在'); return }
    if (photos.blocked) return
    setSaving(true); setPageError('')
    try {
      const relatedClues: JournalRelatedClue[] = clues
      const details: JournalSymptomDetails = { symptomCategory: inferSymptomCategory(draft.keywords), narrative: draft.narrative.trim(), keywords: draft.keywords, locations: toSymptomLocations(draft.locations), descriptors: [], linkedRecordIds: draft.linkedRecordIds, relatedClues, ...(draft.locationText.trim() ? { locationText: draft.locationText.trim() } : {}), ...(draft.impactLevel ? { impactLevel: draft.impactLevel } : {}), ...(draft.triggerText.trim() ? { triggerText: draft.triggerText.trim() } : {}) }
      details.generatedSummary = generateSymptomSummary(details, photos.photos.length)
      const occurredAt = localDateTimeToIso(draft.occurredAt)
      const result = await onConfirm(details.generatedSummary, occurredAt, 'text', photos.payload(), { categories: ['symptom'], symptom: details, occurredAt, timePrecision: 'exact' })
      photos.clearAfterSave()
      sessionStorage.removeItem(draftKey(memberId))
      if (navigateAfterSave) {
        sessionStorage.setItem(JOURNAL_SAVED_FLASH_KEY, result.message)
        window.location.replace('/health-events')
      } else {
        onSaved(result.message)
        onClose()
      }
    } catch (reason) { setPageError(reason instanceof Error ? reason.message : '保存失败，请重试') }
    finally { setSaving(false) }
  }

  return <div className="symptom-record-page-layer"><section aria-label="记录症状" aria-modal="true" className="symptom-record-page" role="dialog">
    <header><button aria-label="返回" disabled={saving} onClick={() => leave(onBack)} type="button"><ArrowLeft size={22} /></button><h1>记录症状</h1><button aria-label="关闭" disabled={saving} onClick={() => leave(onClose)} type="button"><X size={21} /></button></header>
    <div className="symptom-record-scroll">
      <section className="symptom-description-section"><div className="symptom-heading"><h2>症状描述 <small>主诉</small></h2></div><div className="symptom-description-box"><textarea ref={narrativeRef} aria-label="症状描述" maxLength={1000} onChange={(event) => update('narrative', event.target.value)} placeholder="直接说说哪里不舒服、出现了什么表现" value={draft.narrative} /><div className="symptom-description-tools"><button aria-pressed={listening} onClick={startVoice} type="button">{listening ? <Square size={17} /> : <Mic size={18} />}{listening ? '结束语音' : '语音输入'}</button><button onClick={() => setAttachmentOpen(true)} type="button"><Paperclip size={18} />照片 / 附件</button></div>{voiceStatus && <p aria-live="polite" className="symptom-voice-status">{voiceStatus}</p>}</div>{photos.photos.length > 0 && <QuickRecordPhotos limit={6} model={photos} />}</section>
      <div className="symptom-auto-label"><span>根据描述自动带出</span><span>点击可修改</span></div>
      <div className="symptom-auto-rows">
        <button onClick={() => setSummaryOpen(true)} type="button"><span>症状摘要</span><span className={!draft.keywords.length ? 'is-empty' : ''}><strong>{draft.keywords.length ? draft.keywords.join('、') : '未识别到有效信息'}</strong><small>{draft.summaryManuallyEdited ? '已手动修改' : draft.keywords.length ? '从描述中识别' : '可点击手动补充'}</small></span><ChevronRight size={18} /></button>
        <div className="symptom-location-selector"><span>症状部位</span><span className={!draft.locations.length && !draft.locationText ? 'is-empty' : ''}><strong>{draft.locations.length ? draft.locations.map((item) => item.label).join('、') : draft.locationText || '未识别到有效信息'}</strong><small>{draft.locationManuallyEdited ? '已手动修改' : draft.locationText ? '从描述中识别' : '可点击手动补充'}</small></span><BodyLocationPicker buttonLabel="修改" compact inputLike label="" showEmptyState={false} value={draft.locations} onChange={(locations) => setDraft((current) => ({ ...current, locations, locationText: locations.map((item) => item.label).join('、'), locationManuallyEdited: true }))} /></div>
      </div>
      <section className={`symptom-supplement${optionalOpen ? ' is-open' : ''}`}><button aria-expanded={optionalOpen} className="symptom-supplement-toggle" onClick={() => setOptionalOpen((value) => !value)} type="button"><span><strong>补充信息</strong><small>选填</small></span><ChevronDown size={18} /></button>{optionalOpen && <div className="symptom-supplement-body">
        <div className="symptom-severity-trigger"><label><span>严重程度 <small>主观感受</small></span><output>{draft.impactLevel ? impactLabels[draft.impactLevel] : '未填写'}</output><input aria-label="严重程度" aria-valuetext={draft.impactLevel ? impactLabels[draft.impactLevel] : '未填写'} data-empty={!draft.impactLevel} max="2" min="0" onChange={(event) => update('impactLevel', impactValues[Number(event.target.value)])} step="1" type="range" value={draft.impactLevel ? impactValues.indexOf(draft.impactLevel) : 0} /></label><label><span>可能诱因</span><input maxLength={160} onChange={(event) => update('triggerText', event.target.value)} placeholder="食物、药物、环境等回忆或猜测" value={draft.triggerText} /></label></div>
        {clues.length > 0 && <div className="symptom-related-clues"><h3>描述中的相关线索</h3>{clues.map((clue) => <article key={clue.id}><span><strong>{clue.label} · {clue.certainty === 'uncertain' ? '家长猜测' : clue.certainty === 'negated' ? '否定描述' : '原文提及'}</strong><small>“{clue.sourceText}” · 来自{clue.sourceField === 'narrative' ? '症状描述' : '可能诱因'}</small></span><button onClick={() => update('excludedClueIds', [...draft.excludedClueIds, clue.id])} type="button">移除</button></article>)}</div>}
        <RecordRelationSection title="补充日常信息" hint="饮食、喂养、营养补剂、睡眠与排便" memberId={memberId} token={token} occurredAt={draft.occurredAt} categories={['diet', 'sleep', 'elimination']} nearbyDays={2} selectedIds={draft.linkedRecordIds.daily ?? []} onChange={(ids) => setLinks('daily', ids)} onBackfill={onBackfill} target="daily" />
        <RecordRelationSection title="补充就医情况" hint="医院带回的病历、报告与用药单" memberId={memberId} token={token} occurredAt={draft.occurredAt} categories={['visit']} selectedIds={draft.linkedRecordIds.visit ?? []} onChange={(ids) => setLinks('visit', ids)} onBackfill={onBackfill} target="visit" />
        <RecordRelationSection title="补充用药信息" hint="药品与实际用量" memberId={memberId} token={token} occurredAt={draft.occurredAt} categories={['medication']} selectedIds={draft.linkedRecordIds.medication ?? []} onChange={(ids) => setLinks('medication', ids)} onBackfill={onBackfill} target="medication" />
      </div>}</section>
      <label className="symptom-time-row"><span>记录时间</span><input aria-label="记录时间" max={localDateTimeValue()} onChange={(event) => update('occurredAt', event.target.value)} type="datetime-local" value={draft.occurredAt} /></label>
      {pageError && <p className="symptom-save-error" role="alert">{pageError}</p>}<div className="symptom-record-save"><HohoButton disabled={saving || photos.blocked} fullWidth loading={saving} onClick={() => void save()} size="large">保存记录</HohoButton></div>
    </div>
    <BottomSheetSurface label="选择症状" onClose={() => setSummaryOpen(false)} open={summaryOpen} size="workspace" title="选择症状" footer={<HohoButton fullWidth onClick={() => setSummaryOpen(false)} size="large">完成 · {draft.keywords.length} 项</HohoButton>}><SymptomSummaryPicker values={draft.keywords} onChange={(keywords) => setDraft((current) => ({ ...current, keywords, summaryManuallyEdited: true }))} /></BottomSheetSurface>
    <BottomSheetSurface label="添加照片或附件" onClose={() => setAttachmentOpen(false)} open={attachmentOpen} title="添加照片或附件"><div className="symptom-attachment-options"><button onClick={() => cameraRef.current?.click()} type="button"><Camera size={22} /><span>拍照</span></button><button onClick={() => albumRef.current?.click()} type="button"><ImagePlus size={22} /><span>从相册选择</span></button></div></BottomSheetSurface>
    <input ref={cameraRef} accept="image/*" capture="environment" hidden onChange={(event) => { photos.chooseFiles(event.target.files); event.currentTarget.value = ''; setAttachmentOpen(false) }} type="file" /><input ref={albumRef} accept="image/jpeg,image/png,image/webp" hidden multiple onChange={(event) => { photos.chooseFiles(event.target.files); event.currentTarget.value = ''; setAttachmentOpen(false) }} type="file" />
  </section></div>
}

function SymptomSummaryPicker({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  const [custom, setCustom] = useState('')
  const toggle = (value: string) => onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value])
  const add = () => { const value = custom.trim(); if (!value) return; if (!values.includes(value)) onChange([...values, value]); setCustom('') }
  return <div className="symptom-summary-picker"><p>选择实际出现的表现，可多选</p>{Object.entries(symptomGroups).map(([group, options]) => <section key={group}><h3>{group}</h3><div>{options.map((option) => <button aria-pressed={values.includes(option)} key={option} onClick={() => toggle(option)} type="button">{option}</button>)}</div></section>)}<label><span>其他症状</span><span><input maxLength={80} onChange={(event) => setCustom(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add() } }} placeholder="输入其他表现" value={custom} /><button disabled={!custom.trim()} onClick={add} type="button"><Plus size={17} />添加</button></span></label>{values.length > 0 && <div className="symptom-summary-selected">{values.map((value) => <button aria-label={`移除${value}`} key={value} onClick={() => toggle(value)} type="button">{value}<X size={13} /></button>)}</div>}</div>
}

type LegacyRelationKey = 'daily' | 'medication' | 'visit'
const legacyRelationLabels: Record<LegacyRelationKey, string> = { daily: '日常', medication: '用药', visit: '就医' }
const legacyRelationCategories: Record<LegacyRelationKey, string[]> = { daily: ['diet', 'sleep', 'elimination'], medication: ['medication'], visit: ['visit'] }

/** Kept for the existing detail editor; new-record flows use RecordRelationSection. */
export function RelatedRecordsSheet({ entries, error, linked, loading, onChange, onClose, onRetry, open }: { entries: JournalEntry[]; error: string; linked: SymptomLinkedRecordIds; loading: boolean; onChange: (value: SymptomLinkedRecordIds) => void; onClose: () => void; onRetry: () => void; open: boolean }) {
  const [category, setCategory] = useState<LegacyRelationKey | null>(null)
  useEffect(() => { if (!open) setCategory(null) }, [open])
  const candidates = category ? entries.filter((entry) => legacyRelationCategories[category].some((value) => entry.categories?.includes(value as never))) : []
  const toggle = (key: LegacyRelationKey, id: string) => { const ids = linked[key] ?? []; onChange({ ...linked, [key]: ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id] }) }
  return <BottomSheetSurface label="关联其他记录" onClose={onClose} open={open} size="workspace" title={category ? legacyRelationLabels[category] : '关联其他记录'} footer={<HohoButton fullWidth onClick={onClose} size="large">完成</HohoButton>}>
    {category ? <div className="symptom-related-list"><button className="symptom-related-back" onClick={() => setCategory(null)} type="button"><ChevronLeft size={18} />返回记录类型</button>{loading ? <StatusNotice title="正在读取可关联记录" /> : error ? <StatusNotice action={<HohoButton variant="secondary" onClick={onRetry}>重新加载</HohoButton>} tone="error" title={error} /> : candidates.length ? candidates.map((entry) => { const checked = (linked[category] ?? []).includes(entry.id); return <button aria-pressed={checked} key={entry.id} onClick={() => toggle(category, entry.id)} type="button"><span><strong>{journalCategoryLabels[entry.categories?.[0] ?? 'other']}</strong><small>{new Date(entry.occurredAt).toLocaleString('zh-CN')}</small><em>{journalListSummary(entry)}</em></span>{checked && <Check size={20} />}</button> }) : <div className="symptom-related-empty"><strong>没有可关联的{legacyRelationLabels[category]}记录</strong></div>}</div> : <div className="symptom-supplement-tabs">{(Object.keys(legacyRelationLabels) as LegacyRelationKey[]).map((key) => <button key={key} onClick={() => setCategory(key)} type="button"><span>{legacyRelationLabels[key]}</span><small>{linked[key]?.length ? `已选 ${linked[key]!.length} 条` : '选择具体记录'}</small></button>)}</div>}
  </BottomSheetSurface>
}

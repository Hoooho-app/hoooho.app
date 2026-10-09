import { nurseApi } from '../../features/ai-nurse/api'
import { useVisibleViewport } from '../../hooks/useVisibleViewport'
import { SymptomVoiceSheet } from './SymptomVoiceSheet'
import { NursePanel } from '../../features/ai-nurse/NursePanel'
import { NurseNotes } from '../../features/ai-nurse/NurseNotes'
import { mergeNurseReview } from '../../features/ai-nurse/mergeReview'
import type { NurseFields, NurseMetadata } from '../../features/ai-nurse/types'
import { useAppStore } from '../../store/useAppStore'
import { bodyLocationLabel } from '../../../shared/body-location-label.mjs'
import { Check, ChevronDown, ChevronLeft, Clock3, MapPin, Mic, Camera, Image, Cross, ClipboardPlus, X, Stethoscope } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { ChildBodyLocationPicker } from '../../components/health/body-location/ChildBodyLocationPicker'
import { childSelectionKey, resolveChildModel, toChildSelection } from '../../features/body-location/childBodyCatalog'
import type { BodyLocationSelection } from '../../features/body-location'
import type { JournalMetadata, JournalSymptomDetails, SymptomImpactLevel } from '../../types/journal'
import { localDateTimeToIso, localDateTimeValue } from '../../utils/healthOccurredAt'
import { symptomPreviewService } from '../../services/symptomPreview'
import { QuickRecordPhotos, useQuickRecordPhotos, type QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { inferSymptomCategory, toSymptomLocations, fromSymptomLocations } from './symptomRecordLogic'

import { journalCategoryLabels, journalListSummary, type JournalEntry } from './timeViewModel'
import { OccurrenceTimeField, useOccurrenceTime } from './OccurrenceTimeField'
import './TimeView.css'
import './SymptomRecordFlow.css'

type SaveRecord = (content: string, occurredAt: string, channel: 'text', photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>
type SupplementKey = 'diet' | 'elimination' | 'medication' | 'visit'
export type SymptomLinkedRecordIds = Partial<Record<SupplementKey, string[]>>
interface Draft {
  narrative: string; summary: string; keywords: string[]; locationText: string; locations: BodyLocationSelection[]; occurredAt?: string
  appliedMediaIds?: string[]
  aiNurse?: NurseMetadata; nurseEditedFields?: string[]; nurseDeletedNoteIds?: string[]
  nurseWarnings?:string[]; timeText?:string; nursePaused?: boolean
  impactLevel?: SymptomImpactLevel; triggerText: string; trend?: JournalSymptomDetails['trend']; shortNote: string
}
const newDraft = (): Draft => ({ narrative: '', summary: '', keywords: [], locationText: '', locations: [], triggerText: '', shortNote: '' })
const draftKey = (memberId: string) => `hoooho-symptom-record-draft:${useAppStore.getState().authUser?.id ?? 'none'}:${memberId}`
const supplementLabels: Record<SupplementKey, string> = { diet: '进食', elimination: '排便', medication: '用药', visit: '就医' }
const supplementCategory: Record<SupplementKey, string> = { diet: 'diet', elimination: 'elimination', medication: 'medication', visit: 'visit' }

function restoreDraft(memberId: string) {
  const fresh = newDraft()
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey(memberId)) || '{}') as Partial<Draft>
    const hasUserContent = Boolean(saved.narrative?.trim() || saved.summary?.trim() || saved.locationText?.trim() || saved.locations?.length || saved.triggerText?.trim() || saved.impactLevel || saved.trend || saved.shortNote?.trim() || saved.occurredAt || saved.nursePaused)
    return hasUserContent ? { ...fresh, ...saved } : fresh
  } catch { return fresh }
}

const impactOptions: readonly [SymptomImpactLevel, string][] = [['little', '轻度'], ['some', '中度'], ['clear', '重度']]

export function SymptomRecordFlow({ memberId, token, selectedDay, today, onBack, onClose, onConfirm, onSaved, title = '记录症状', draftScope = memberId, extraFields, embedded = false, saveLabel, onDirtyChange, initialNurseMode }: { memberId: string; token: string; selectedDay: string; today: string; onBack: () => void; onClose: () => void; onConfirm: SaveRecord; onSaved: (message: string) => void; title?: string; draftScope?: string; extraFields?: ReactNode; embedded?: boolean; saveLabel?: string; onDirtyChange?: (dirty: boolean) => void; initialNurseMode?: 'voice' | 'text' }) {
  const [draft, setDraft] = useState<Draft>(() => restoreDraft(draftScope))
  const draftOwner = useRef(useAppStore.getState().authUser?.id)
  const [voiceOpen,setVoiceOpen]=useState(false),[saveFailed,setSaveFailed]=useState(false)
  type ReviewResult={fields:Partial<NurseFields>;metadata:NurseMetadata;form?:JournalMetadata;warnings?:string[]}
  const [conflict,setConflict]=useState<ReviewResult>(),[selectedSuggestions,setSelectedSuggestions]=useState<string[]>([])
  const [nurseOpen, setNurseOpen] = useState(Boolean(initialNurseMode))
  const initialNurseEntryPending = useRef(Boolean(initialNurseMode))
  const [saving, setSaving] = useState(false), [pageError, setPageError] = useState('')
  const [recognition, setRecognition] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle')
  const [fieldErrors, setFieldErrors] = useState<{ narrative?: string; location?: string; time?: string }>({})
  const [optionalOpen, setOptionalOpen] = useState(false), [composing, setComposing] = useState(false)
  const videoInputRef = useRef<HTMLInputElement>(null), photoInputRef = useRef<HTMLInputElement>(null), narrativeRef = useRef<HTMLTextAreaElement>(null)
  const locationEditedRef = useRef(Boolean(draft.locationText || draft.locations.length))
  const previewVersionRef = useRef(0)
  const photos = useQuickRecordPhotos(memberId, token, 6, draftScope === memberId ? 'symptom' : `symptom:${draftScope}`, true)
  const draftRef=useRef(draft);draftRef.current=draft
  useEffect(() => {
    if (!draft.aiNurse || nurseOpen || saving) return
    const metadata = draft.aiNurse, abort = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const original = await nurseApi.get(memberId, token, metadata.draftId, abort.signal)
        if (original.saved) return
        await nurseApi.change(memberId, token, original, { step: 'review', review: { fields: { narrative: draft.narrative, timeText:draft.timeText??'', locationText: draft.locationText, impactLevel: draft.impactLevel ?? '', triggerText: draft.triggerText, trend: draft.trend === 'recurrent' ? '' : draft.trend ?? '' }, metadata: { ...metadata, editedFields: draft.nurseEditedFields ?? [] }, deletedNoteIds: draft.nurseDeletedNoteIds ?? [], form: reviewForm(draft) } }, abort.signal)
      } catch (reason) { if ((reason as Error).name !== 'AbortError') setPageError('核对修改尚未同步，页面草稿保留。请恢复网络后再保存。') }
    }, 500)
    return () => { window.clearTimeout(timer); abort.abort() }
  }, [draft, memberId, nurseOpen, saving, token])
  const reviewForm = (value: Draft): JournalMetadata => ({ categories: ['symptom'], symptom: { symptomCategory: inferSymptomCategory(value.keywords), narrative: value.narrative, keywords: value.keywords, locations: toSymptomLocations(value.locations), descriptors: [], linkedRecordIds: {}, ...(value.locationText ? { locationText: value.locationText } : {}), ...(value.impactLevel ? { impactLevel: value.impactLevel } : {}), ...(value.triggerText ? { triggerText: value.triggerText } : {}), ...(value.trend ? { trend: value.trend } : {}), ...(value.shortNote ? { shortNote: value.shortNote } : {}), ...(value.summary ? { generatedSummary: value.summary } : {}) }, timePrecision: 'exact', ...(value.occurredAt ? { occurredAt: localDateTimeToIso(value.occurredAt) } : {}) })
  const persistReview = async (value: Draft) => {
    if (!value.aiNurse) return
    const original = await nurseApi.get(memberId, token, value.aiNurse.draftId)
    if (!original.saved) await nurseApi.change(memberId, token, original, { step: 'review', review: { fields: { narrative: value.narrative, timeText:value.timeText??'', locationText: value.locationText, impactLevel: value.impactLevel ?? '', triggerText: value.triggerText, trend: value.trend === 'recurrent' ? '' : value.trend ?? '' }, metadata: { ...value.aiNurse, editedFields: value.nurseEditedFields ?? [] }, deletedNoteIds: value.nurseDeletedNoteIds ?? [], form: reviewForm(value) } })
  }
  const appliedMedia=useRef(new Set<string>())
  const occurrence = useOccurrenceTime(selectedDay, today, draft.occurredAt)
  const viewport = useVisibleViewport()
  useEffect(() => {
    if (embedded) return
    const body=document.body,previous={position:body.style.position,top:body.style.top,width:body.style.width,overflow:body.style.overflow},scrollY=window.scrollY
    body.style.position='fixed';body.style.top=`${-scrollY}px`;body.style.width='100%';body.style.overflow='hidden'
    return()=>{Object.assign(body.style,previous);window.scrollTo(0,scrollY)}
  },[embedded])
  useEffect(() => { const current = useAppStore.getState(); if (current.authUser?.id === draftOwner.current && current.currentMemberId === memberId) sessionStorage.setItem(draftKey(draftScope), JSON.stringify(draft)) }, [draft, draftScope, memberId])
  useEffect(() => { if (useAppStore.getState().authUser?.id === draftOwner.current) setDraft(restoreDraft(draftScope)) }, [draftScope, memberId])
  useEffect(() => {
    const accountId = useAppStore.getState().authUser?.id
    return useAppStore.subscribe(current => { if (current.authUser?.id !== accountId || current.currentMemberId !== memberId) { void persistReview(draftRef.current).catch(() => undefined); setNurseOpen(false); setVoiceOpen(false); setDraft(newDraft()); setPageError('') } })
  }, [draftScope, memberId])
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
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft((current) => ({ ...current, [key]: value, nurseEditedFields: [...new Set([...(current.nurseEditedFields ?? []), key])] })); setPageError('') }
  const updateNarrative = (value: string) => {
    setDraft((current) => ({ ...current, narrative: value, keywords: [], nurseEditedFields: [...new Set([...(current.nurseEditedFields ?? []), 'narrative'])] }))
    if (!composing) setRecognition(value.trim() ? 'loading' : 'idle')
    setFieldErrors((current) => ({ ...current, narrative: undefined }))
    setPageError('')
  }
  const voice = {busy:voiceOpen, stop:()=>setVoiceOpen(false)}
  const canSave = Boolean(draft.narrative.trim() || photos.photos.some(p=>p.status==='uploaded'))
  const isDirty = Boolean(draft.narrative.trim() || draft.summary.trim() || draft.locationText.trim() || draft.locations.length || draft.triggerText.trim() || draft.impactLevel || draft.trend || draft.shortNote.trim() || draft.occurredAt || photos.photos.length)
  useEffect(() => { onDirtyChange?.(isDirty || saving || voice.busy); return () => onDirtyChange?.(false) }, [isDirty, saving, voice.busy, onDirtyChange])
  const leave = (action: () => void) => { if (!isDirty || window.confirm('这条症状还没有保存，保留草稿并退出？')) { void persistReview(draftRef.current).then(action).catch(() => setPageError('草稿尚未同步，请恢复网络后重试退出；当前内容保留。')) } }
  const save = async () => {
    if (saving || voice.busy) return
    if (!draft.narrative.trim() && !photos.photos.some(p=>p.status==='uploaded')) { setFieldErrors((current) => ({ ...current, narrative: '请填写哪里不舒服' })); narrativeRef.current?.focus(); narrativeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return }
    if (!canSave) return
    if(photos.blocked && !window.confirm('部分资料尚未上传成功，本次只保存正文和已上传原件。未完成资料不会标记为已保存，是否继续？'))return
    if(!draft.narrative.trim() && !window.confirm('仅保存原始资料，症状待补充，发生时间标为不确定。是否继续？'))return
    const occurredAt = occurrence.capture()
    if (!occurredAt) return
    setSaving(true); setSaveFailed(false); setPageError(''); setFieldErrors({})
    try {
      const details: JournalSymptomDetails = { symptomCategory: inferSymptomCategory(draft.keywords), narrative: draft.narrative, keywords: draft.keywords, locations: toSymptomLocations(draft.locations), descriptors: [], linkedRecordIds: {}, ...(draft.locationText.trim() ? { locationText: draft.locationText.trim() } : {}), ...(draft.impactLevel ? { impactLevel: draft.impactLevel } : {}), ...(draft.triggerText.trim() ? { triggerText: draft.triggerText.trim() } : {}), ...(draft.trend ? { trend: draft.trend } : {}), ...(draft.shortNote.trim() ? { shortNote: draft.shortNote.trim() } : {}) }
      if (draft.summary.trim()) details.generatedSummary = draft.summary.trim()
      const message = await onConfirm(draft.narrative.trim() || '症状待补充（原始资料）', occurredAt, 'text', photos.payload(), draft.narrative.trim() ? { categories: ['symptom'], symptom: details, occurredAt, timePrecision: 'exact', ...(draft.aiNurse ? { aiNurse: { ...draft.aiNurse, editedFields: draft.nurseEditedFields ?? [], snapshots: [...draft.aiNurse.snapshots, { narrative: draft.narrative, fields: { narrative: draft.narrative, timeText:draft.timeText??'', locationText: draft.locationText, impactLevel: draft.impactLevel ?? '', triggerText: draft.triggerText, trend: draft.trend === 'recurrent' ? '' : draft.trend ?? '' } satisfies NurseFields, at: new Date().toISOString(), kind: 'user_confirmed' as const }].slice(-20) } } : {}) } : { categories:['other'],timePrecision:'unknown' })
      photos.clearAfterSave(); sessionStorage.removeItem(draftKey(draftScope)); onSaved(message); onClose()
    } catch (reason) {
      setSaveFailed(true)
      const message = reason instanceof Error ? reason.message : '保存失败，请重试'
      if (message.includes('主要症状') || message.includes('其他症状')) setFieldErrors((current) => ({ ...current, narrative: '请填写哪里不舒服' }))
      else setPageError(message)
    } finally { setSaving(false) }
  }
  const applyReview=(result:ReviewResult,allowed:string[]=[])=>{
    const {metadata,form:restoredForm}=result,proposed=metadata.snapshots.at(-1)?.fields??result.fields
    const fields={...result.fields,...Object.fromEntries(allowed.map(k=>[k,proposed[k as keyof NurseFields]]))}
    const reviewedOccurredAt = restoredForm?.occurredAt && restoredForm.timePrecision !== 'unknown' ? localDateTimeValue(new Date(restoredForm.occurredAt)) : undefined
    if (!draft.nurseEditedFields?.includes('occurredAt')) {
      if (reviewedOccurredAt) occurrence.setSpecifiedValue(reviewedOccurredAt)
      else occurrence.setMode('now')
    }
    setDraft(current=>{
      const manualFields=new Set(current.nurseEditedFields??[])
      if(!current.aiNurse)for(const key of Object.keys(fields))if(current[key as keyof Draft])manualFields.add(key)
      for(const key of allowed)manualFields.delete(key)
      const changes=Object.fromEntries(Object.entries(fields).filter(([key])=>!manualFields.has(key)))
      const aiNurse=mergeNurseReview(current.aiNurse,metadata,current.nurseDeletedNoteIds)
      let locations=current.locations
      if(!manualFields.has('locations')&&!manualFields.has('locationText')){
        if(restoredForm?.symptom?.locations?.length)locations=fromSymptomLocations(restoredForm.symptom.locations)
        else if(['脸上','脸部','面部'].includes(String(changes.locationText))){const model=resolveChildModel(useAppStore.getState().members.find(m=>m.id===memberId)?.gender);if(model)locations=[toChildSelection('face_uncertain',model)]}
      }
      return {...current,...(restoredForm?.symptom?{shortNote:manualFields.has('shortNote')?current.shortNote:restoredForm.symptom.shortNote??current.shortNote,summary:current.summary,keywords:current.keywords}:{}),...changes,...(!manualFields.has('occurredAt')?{occurredAt:reviewedOccurredAt}:{}),locations,aiNurse,nurseWarnings:result.warnings,nursePaused:true,nurseEditedFields:[...manualFields]}
    });locationEditedRef.current=true;setPageError('');setNurseOpen(false);setConflict(undefined)
  }
  const reviewConflicts=(result:ReviewResult)=>Object.entries(result.metadata.snapshots.at(-1)?.fields??result.fields).filter(([key,value])=>typeof value==='string'&&value.length>0&&value!==draft[key as keyof Draft]&&((draft.nurseEditedFields??[]).includes(key)||(!draft.aiNurse&&Boolean(draft[key as keyof Draft]))))
  const manualLocation = draft.locationText.trim()
  const manualLocationIsStructured = draft.locations.some((location) => location.label.trim() === manualLocation)
  const inlineOccurrence=embedded&&<OccurrenceTimeField model={occurrence} label="发生时间" labelIcon={<Clock3 aria-hidden="true" size={21} strokeWidth={1.8} />} onValueChange={(value) => {update('occurredAt',value||undefined);update('timeText','')}} showDateContext />
  const form = <div className={embedded ? 'symptom-record-inline' : 'symptom-record-page-layer'} style={embedded ? undefined : { top: viewport.top, height: viewport.height, bottom: 'auto' }}><section aria-label={title} aria-modal={embedded ? undefined : true} data-keyboard={viewport.keyboard} className="symptom-record-page symptom-record-page--brand-white" role={embedded ? 'region' : 'dialog'}>
    {!embedded && <header><button aria-label="返回" disabled={saving} onClick={() => leave(onBack)} type="button"><ChevronLeft aria-hidden="true" size={24} strokeWidth={1.8} /></button><h1>{title}</h1></header>}
    <div className="symptom-record-scroll">
      {draft.nursePaused && !draft.aiNurse && <p className="symptom-draft-notice">AI 对话已暂停，内容保留。<button onClick={()=>setNurseOpen(true)}>继续</button></p>}{saveFailed&&<p role="alert" className="symptom-save-error">暂未保存成功。修改和原始对话仍在，可在下方重试保存。</p>}
      {draft.nurseWarnings?.map(warning=><p key={warning} role="alert" className="symptom-draft-notice">{warning}</p>)}
      <section className="symptom-card symptom-narrative"><div className="symptom-heading"><h2 aria-label="症状描述（主诉）"><Cross aria-hidden="true" size={21} strokeWidth={1.8} />症状描述<span>（主诉）</span></h2></div><textarea ref={narrativeRef} aria-describedby={fieldErrors.narrative ? 'symptom-narrative-error' : undefined} aria-invalid={Boolean(fieldErrors.narrative)} aria-label="哪里不舒服" maxLength={1000} readOnly={voice.busy} onBlur={() => { if (narrativeRef.current) narrativeRef.current.scrollTop = 0 }} onChange={(event) => updateNarrative(event.target.value)} onCompositionEnd={(event) => { setComposing(false); updateNarrative(event.currentTarget.value) }} onCompositionStart={() => { previewVersionRef.current += 1; setComposing(true); setRecognition('idle') }} placeholder="描述症状和变化，例如：左肘窝发红、发痒" value={draft.narrative} />{fieldErrors.narrative && <p className="symptom-field-error" id="symptom-narrative-error" role="alert">{fieldErrors.narrative}</p>}{recognition === 'loading' && <p className="symptom-extraction-note" role="status">正在整理症状描述…</p>}{recognition === 'success' && <p className="symptom-extraction-note" role="status">已整理，可继续修改</p>}{recognition === 'empty' && <p className="symptom-extraction-note">暂未生成摘要，可直接保存原文。</p>}{recognition === 'error' && <p className="symptom-extraction-note">暂时无法整理，可直接保存原文。</p>}{draft.keywords.length > 0 && <div className="symptom-keywords">{draft.keywords.map((keyword) => <button aria-label={`移除${keyword}`} key={keyword} onClick={() => update('keywords', draft.keywords.filter((item) => item !== keyword))} type="button">{keyword}<X aria-hidden="true" size={12} /></button>)}</div>}
      </section>
      {inlineOccurrence}
      {(photos.photos.length > 0 || photos.notice) && <div className="symptom-media-previews"><QuickRecordPhotos limit={6} model={photos} showAddButton={false} onApply={(text,id)=>{if(appliedMedia.current.has(id)||draftRef.current.appliedMediaIds?.includes(id))return;const next=[draftRef.current.narrative.trim(),text].filter(Boolean).join('\n');if(next.length>1000)throw new Error('补充后超过1000字，请先精简资料草稿；原正文未改变');appliedMedia.current.add(id);setDraft(current=>({...current,narrative:next,appliedMediaIds:[...(current.appliedMediaIds??[]),id]}));setFieldErrors({})}} /></div>}
      <section className="symptom-card symptom-location-card"><div className="symptom-card-heading"><h2><MapPin aria-hidden="true" size={21} strokeWidth={1.8} />症状部位</h2></div><div className="symptom-location-entry"><input aria-label="手动补充症状部位" maxLength={120} onChange={(event) => { locationEditedRef.current = true; update('locationText', event.target.value) }} placeholder="例如：左肘窝" value={draft.locationText} /><ChildBodyLocationPicker memberId={memberId} showCommitted={false} buttonLabel={draft.locations.length ? '修改' : '选择部位'} confirmLabel="完成并返回症状记录" value={draft.locations} onChange={(locations) => { locationEditedRef.current = true; setDraft((current) => ({ ...current, locations, nurseEditedFields: [...new Set([...(current.nurseEditedFields ?? []), 'locations', 'locationText'])] })); setPageError('') }} /></div>{Boolean(draft.locations.length || manualLocation) && <div aria-label="已选择的症状部位" className="symptom-location-tags">{draft.locations.map((location) => <span key={childSelectionKey(location)}><Check aria-hidden="true" size={15} />{bodyLocationLabel(location)}</span>)}{manualLocation && !manualLocationIsStructured && <span><Check aria-hidden="true" size={15} />{manualLocation}</span>}</div>}</section>
      <section className={`symptom-card symptom-supplement-card${optionalOpen ? ' is-expanded' : ''}`}><button aria-expanded={optionalOpen} className="symptom-card-action" onClick={() => setOptionalOpen((value) => !value)} type="button"><strong><ClipboardPlus aria-hidden="true" size={21} strokeWidth={1.8} />补充信息</strong><span>{optionalOpen ? '收起' : '展开'}<ChevronDown aria-hidden="true" className={optionalOpen ? 'is-open' : ''} size={18} /></span></button>{optionalOpen && <div className="symptom-optional-fields">
        <fieldset><legend>严重程度</legend><div className="symptom-segmented-options">{impactOptions.map(([value, label]) => <button aria-pressed={draft.impactLevel === value} key={value} onClick={() => update('impactLevel', draft.impactLevel === value ? undefined : value)} type="button">{draft.impactLevel === value && <Check aria-hidden="true" size={15} />}{label}</button>)}</div></fieldset>
      </div>}</section>
      {!embedded&&<OccurrenceTimeField model={occurrence} label="发生时间" labelIcon={<Clock3 aria-hidden="true" size={21} strokeWidth={1.8} />} onValueChange={(value) => {update('occurredAt',value||undefined);update('timeText','')}} showDateContext />}
      {draft.aiNurse && <NurseNotes value={draft.aiNurse} onChange={value => setDraft(current => ({ ...current, aiNurse: value, nurseDeletedNoteIds: [...new Set([...(current.nurseDeletedNoteIds ?? []), ...(current.aiNurse?.professionalNotes.filter(n => !value.professionalNotes.some(v => v.id === n.id)).map(n => n.id) ?? [])])] }))}/>}
      {extraFields}
      {pageError && <p className="symptom-save-error" role="alert">{pageError}</p>}
    </div>
    <div className="symptom-record-save" hidden={nurseOpen||voiceOpen||!!conflict}>
      <section aria-label="记录输入方式" className="symptom-record-toolbar">
        <button disabled={saving} onClick={()=>videoInputRef.current?.click()} type="button"><Camera size={21} aria-hidden="true"/>拍照</button>
        <button disabled={saving} onClick={()=>photoInputRef.current?.click()} type="button"><Image size={21} aria-hidden="true"/>选照片</button>
        <button disabled={saving} onClick={()=>setVoiceOpen(true)} type="button"><Mic size={21} aria-hidden="true"/>语音输入</button>
        <button className="symptom-nurse-entry" disabled={saving} onClick={()=>setNurseOpen(true)} type="button"><Stethoscope size={21} aria-hidden="true"/>{draft.aiNurse||draft.nursePaused?'智能记录 · 继续':'智能记录'}</button>
      </section>
      <div className="symptom-save-buttons">{embedded && <HohoButton variant="secondary" disabled={saving || voice.busy} onClick={() => leave(onBack)}>取消</HohoButton>}<HohoButton disabled={saving || voice.busy} fullWidth loading={saving} onClick={() => void save()} size="large">{saveFailed?'重试保存':draft.aiNurse ? '确认并保存' : saveLabel || (photos.blocked ? '先保存已有内容' : '保存')}</HohoButton></div>
    </div>
    <input ref={videoInputRef} aria-label="拍照或录视频" accept="image/*,video/*" capture="environment" hidden onChange={(event) => { photos.chooseFiles(event.target.files,'capture'); event.currentTarget.value = '' }} type="file" />
    <input aria-label="选择照片" ref={photoInputRef} accept="image/*,video/*" hidden multiple onChange={(event) => { photos.chooseFiles(event.target.files); event.currentTarget.value = '' }} type="file" />
    {voiceOpen&&<SymptomVoiceSheet onClose={()=>setVoiceOpen(false)} onApply={text=>{const next=[draftRef.current.narrative.trim(),text].filter(Boolean).join('\n');if(next.length>1000)return false;updateNarrative(next);return true}}/>}
    {nurseOpen && <NursePanel onPhoto={source=>(source==='camera'?videoInputRef:photoInputRef).current?.click()} photoCount={photos.photos.length} resuming={draft.nursePaused} initialMode={initialNurseEntryPending.current ? initialNurseMode : undefined} onPaused={()=>setDraft(current=>({...current,nursePaused:true}))} formContext={reviewForm(draft)} memberId={memberId} token={token} scope={draftScope} onClose={() => { initialNurseEntryPending.current = false; setNurseOpen(false) }} initialReview={draft.aiNurse ? { fields: { narrative: draft.narrative, timeText:draft.timeText??'', locationText: draft.locationText, impactLevel: draft.impactLevel, triggerText: draft.triggerText, trend: draft.trend === 'recurrent' ? '' : draft.trend }, metadata: { ...draft.aiNurse, editedFields: draft.nurseEditedFields ?? [] }, deletedNoteIds: draft.nurseDeletedNoteIds ?? [], form: reviewForm(draft) } : undefined} onApply={(fields,metadata,restoredForm,restore,warnings)=>{const result={fields,metadata,form:restoredForm,warnings};setNurseOpen(false);if(!restore&&reviewConflicts(result).length){setSelectedSuggestions([]);setConflict(result)}else applyReview(result)}}/>}
    {conflict&&<BottomSheetSurface open viewportAware className="symptom-conflict-sheet" layerClassName="symptom-input-layer" label="核对人工修改" title="核对修改" onClose={()=>setConflict(undefined)} footer={<div className="nurse-controls"><HohoButton onClick={()=>applyReview(conflict)}>保留我的修改，回填其他项</HohoButton><HohoButton variant="secondary" disabled={!selectedSuggestions.length} onClick={()=>applyReview(conflict,selectedSuggestions)}>使用所选 AI 建议</HohoButton></div>}>
      <p>你已修改以下内容，请选择是否使用 AI 建议。未选择的项保留人工修改。</p>{reviewConflicts(conflict).map(([key,value])=><section className="symptom-card" key={key}><label><input type="checkbox" checked={selectedSuggestions.includes(key)} onChange={e=>setSelectedSuggestions(current=>e.target.checked?[...current,key]:current.filter(k=>k!==key))}/>{{narrative:'症状描述',locationText:'症状部位',timeText:'发生时间',impactLevel:'严重程度',triggerText:'诱因',trend:'变化'}[key]??key}</label><p>当前：{String(draft[key as keyof Draft]||'未填写')}</p><p>AI 建议：{String(value||'未填写')}</p></section>)}
    </BottomSheetSurface>}
  </section></div>
  return embedded ? form : createPortal(form, document.body)
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

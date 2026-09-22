import { ArrowLeft, Camera, FileText, ImagePlus, LoaderCircle, Pencil, RefreshCw, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HohoButton } from '../../components/design-system'
import { quickRecordService } from '../../services/quickRecords'
import type { JournalVisitRecognitionField, JournalVisitSourceDocument } from '../../types/journal'
import { localDateTimeToIso, localDateTimeValue } from '../../utils/healthOccurredAt'
import { useQuickRecordPhotos } from '../HealthEventDetail/components/QuickRecordPhotos'
import type { SaveJournalRecord } from './recordFlowTypes'

type Draft = { occurredAt: string; sourceDocuments: JournalVisitSourceDocument[]; recognitionFields: JournalVisitRecognitionField[] }
const blankDraft = (): Draft => ({ occurredAt: '', sourceDocuments: [], recognitionFields: [] })
const draftKey = (memberId: string) => `hoooho-visit-document-draft:${memberId}`
const fieldLabels: Record<JournalVisitRecognitionField['kind'], string> = { visit_time: '就医时间', institution: '机构', department: '科室', diagnosis: '资料中的诊断原文', examination_result: '检查结果', prescription: '处方信息', medical_instruction: '医嘱原文' }

function restore(memberId: string): Draft {
  try { return { ...blankDraft(), ...JSON.parse(sessionStorage.getItem(draftKey(memberId)) ?? '{}') } } catch { return blankDraft() }
}

export function VisitRecordFlow({ memberId, token, onBack, onClose, onConfirm, onSaved }: { memberId: string; token: string; onBack: () => void; onClose: () => void; onConfirm: SaveJournalRecord; onSaved: (message: string) => void }) {
  const [draft, setDraft] = useState(() => restore(memberId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const analysisVersion = useRef(new Map<string, number>())
  const photos = useQuickRecordPhotos(memberId, token, 10, 'visit-documents-v1')
  useEffect(() => { sessionStorage.setItem(draftKey(memberId), JSON.stringify(draft)) }, [draft, memberId])
  useEffect(() => {
    photos.photos.filter((photo) => photo.status === 'uploaded' && photo.serverId && !draft.sourceDocuments.some((item) => item.id === photo.serverId)).forEach((photo) => {
      const serverId = photo.serverId!
      const version = (analysisVersion.current.get(serverId) ?? 0) + 1
      analysisVersion.current.set(serverId, version)
      setDraft((current) => ({ ...current, sourceDocuments: [...current.sourceDocuments, { id: serverId, name: photo.name, mimeType: photo.mimeType ?? 'application/octet-stream', recognitionStatus: 'pending' }] }))
      void quickRecordService.analyzeDocument(photos.draftId(), serverId, memberId, token).then((result) => {
        if (analysisVersion.current.get(serverId) !== version) return
        setDraft((current) => current.sourceDocuments.some((item) => item.id === serverId) ? {
          ...current,
          sourceDocuments: current.sourceDocuments.map((item) => item.id === serverId ? { ...item, recognitionStatus: result.status === 'completed' ? 'completed' : result.status === 'needs_confirmation' ? 'partial' : result.status === 'unavailable' ? 'unavailable' : 'failed', ...(result.errorCode ? { errorCode: result.errorCode } : {}) } : item),
          recognitionFields: [...current.recognitionFields.filter((field) => field.sourceDocumentId !== serverId), ...(result.visitFields ?? [])],
        } : current)
      }).catch((reason) => {
        if (analysisVersion.current.get(serverId) !== version) return
        setDraft((current) => ({ ...current, sourceDocuments: current.sourceDocuments.map((item) => item.id === serverId ? { ...item, recognitionStatus: 'failed', errorCode: reason instanceof Error ? reason.message : 'ANALYSIS_FAILED' } : item) }))
      })
    })
  }, [draft.sourceDocuments, memberId, photos, token])

  const choose = (files: FileList | null) => { photos.chooseFiles(files); setError('') }
  const removeDocument = (serverId: string) => {
    const photo = photos.photos.find((item) => item.serverId === serverId)
    analysisVersion.current.set(serverId, (analysisVersion.current.get(serverId) ?? 0) + 1)
    if (photo) photos.remove(photo.localId)
    setDraft((current) => ({ ...current, sourceDocuments: current.sourceDocuments.filter((item) => item.id !== serverId), recognitionFields: current.recognitionFields.filter((field) => field.sourceDocumentId !== serverId) }))
  }
  const updateField = (id: string, value: string) => setDraft((current) => ({ ...current, recognitionFields: current.recognitionFields.map((field) => field.id === id ? { ...field, value, status: 'user_edited', originalValue: field.originalValue ?? field.value } : field) }))
  const removeField = (id: string) => setDraft((current) => ({ ...current, recognitionFields: current.recognitionFields.filter((field) => field.id !== id) }))
  const retryAnalysis = (documentId: string) => {
    setDraft((current) => ({ ...current, sourceDocuments: current.sourceDocuments.filter((item) => item.id !== documentId), recognitionFields: current.recognitionFields.filter((field) => field.sourceDocumentId !== documentId) }))
  }
  const save = async () => {
    if (saving) return
    if (!photos.photos.some((photo) => photo.status === 'uploaded')) { setError('请先拍照或上传一份就医资料'); return }
    if (photos.blocked) { setError('请等待资料上传完成，或删除上传失败的资料'); return }
    if (!draft.occurredAt) { setError('资料中没有明确时间，请填写实际就医时间'); return }
    const timestamp = Date.parse(draft.occurredAt)
    if (!Number.isFinite(timestamp) || timestamp > Date.now()) { setError('实际就医时间不能晚于现在'); return }
    setSaving(true); setError('')
    try {
      const visit = { visitType: 'other' as const, visitTypeOtherText: '医疗资料', sourceDocuments: draft.sourceDocuments, recognitionFields: draft.recognitionFields, recognitionStatus: draft.recognitionFields.some((field) => field.status === 'user_edited') ? 'user_edited' as const : draft.recognitionFields.length ? 'draft_unverified' as const : 'not_used' as const }
      const summary = draft.recognitionFields.find((field) => field.kind === 'diagnosis')?.value || draft.recognitionFields.find((field) => field.kind === 'examination_result')?.value || `就医资料 ${draft.sourceDocuments.map((item) => item.name).join('、')}`
      const occurredAt = localDateTimeToIso(draft.occurredAt)
      const result = await onConfirm(summary, occurredAt, 'text', photos.payload(), { categories: ['visit'], visit, occurredAt, timePrecision: 'exact' })
      photos.clearAfterSave(); sessionStorage.removeItem(draftKey(memberId)); onSaved(result.message); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，资料和修改内容已保留') } finally { setSaving(false) }
  }

  return <div className="medication-record-page-layer"><section aria-label="记录就医" aria-modal="true" className="medication-record-page visit-document-page" role="dialog">
    <header><button aria-label="返回" disabled={saving} onClick={onBack} type="button"><ArrowLeft /></button><h1>记录就医</h1><button aria-label="关闭" disabled={saving} onClick={onClose} type="button"><X /></button></header>
    <div className="medication-record-scroll visit-document-scroll">
      <section className="visit-document-intro"><span><FileText /></span><div><h2>先上传就医资料</h2><p>病历、检查报告、处方或医院单据都可以。系统只整理资料中能直接读到的内容。</p></div></section>
      <div className="visit-document-actions"><button onClick={() => cameraRef.current?.click()} type="button"><Camera />拍照</button><button onClick={() => galleryRef.current?.click()} type="button"><ImagePlus />从相册选择</button><button onClick={() => fileRef.current?.click()} type="button"><Upload />上传文件</button></div>
      <input ref={cameraRef} accept="image/*" capture="environment" hidden onChange={(event) => { choose(event.target.files); event.currentTarget.value = '' }} type="file" />
      <input ref={galleryRef} accept="image/jpeg,image/png,image/webp" hidden multiple onChange={(event) => { choose(event.target.files); event.currentTarget.value = '' }} type="file" />
      <input ref={fileRef} accept="application/pdf,image/jpeg,image/png,image/webp" hidden multiple onChange={(event) => { choose(event.target.files); event.currentTarget.value = '' }} type="file" />
      {photos.photos.length > 0 && <section className="visit-source-documents"><h2>原始资料</h2>{photos.photos.map((photo) => { const source = photo.serverId ? draft.sourceDocuments.find((item) => item.id === photo.serverId) : null; return <article key={photo.localId}><a href={photo.previewUrl} rel="noreferrer" target="_blank">{photo.mimeType === 'application/pdf' ? <FileText /> : <img alt="" src={photo.previewUrl} />}</a><span><strong>{photo.name}</strong><small>{photo.status === 'uploading' ? '上传中' : photo.status === 'failed' ? photo.error ?? '上传失败' : source?.recognitionStatus === 'pending' ? '正在整理资料' : source?.recognitionStatus === 'completed' ? '已整理，请核对' : source?.recognitionStatus === 'partial' ? '部分内容需核对' : source?.recognitionStatus === 'unavailable' ? '自动整理不可用，可保留原件' : source?.recognitionStatus === 'failed' ? '整理失败，可重试或保留原件' : '等待整理'}{(photo.status === 'uploading' || source?.recognitionStatus === 'pending') && <LoaderCircle className="is-spinning" />}</small></span>{source && ['failed', 'unavailable'].includes(source.recognitionStatus) && <button aria-label={`重试整理${photo.name}`} onClick={() => retryAnalysis(source.id)} type="button"><RefreshCw /></button>}<button aria-label={`删除${photo.name}`} onClick={() => photo.serverId ? removeDocument(photo.serverId) : photos.remove(photo.localId)} type="button"><Trash2 /></button></article>})}</section>}
      {draft.recognitionFields.length > 0 && <section className="visit-recognition-results"><header><div><h2>帮你整理好了</h2><p>每项都保留来源；不确定内容不会被当作事实。</p></div><Pencil /></header>{draft.recognitionFields.map((field) => <label key={field.id}><span><strong>{fieldLabels[field.kind]}</strong><small>{field.sourceName}{field.sourcePage ? ` · 第${field.sourcePage}页` : ''}{field.status === 'uncertain' ? ' · 待核对' : field.status === 'user_edited' ? ' · 已修改' : ''}</small></span><textarea aria-label={fieldLabels[field.kind]} onChange={(event) => updateField(field.id, event.target.value)} rows={field.value.length > 80 ? 3 : 2} value={field.value} /><button onClick={() => removeField(field.id)} type="button">删除这一项</button></label>)}</section>}
      <label className="symptom-time-row"><span>实际就医时间</span><input aria-label="实际就医时间" max={localDateTimeValue()} onChange={(event) => { setDraft((current) => ({ ...current, occurredAt: event.target.value })); setError('') }} type="datetime-local" value={draft.occurredAt} /></label>
      <p className="visit-document-hint">识别失败也不会丢失原始资料，可以填写时间后按原件保存。</p>
      {error && <p className="medication-save-error" role="alert">{error}</p>}<div className="medication-record-save"><HohoButton disabled={saving || photos.blocked} fullWidth loading={saving} onClick={() => void save()} size="large">保存就医记录</HohoButton></div>
    </div>
  </section></div>
}

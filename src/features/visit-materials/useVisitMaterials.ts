import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { ApiRequestError, apiRequest } from '../../services/apiClient'
import { healthEventRecordService } from '../../services/healthEventRecords'
import type { HealthEventRecordApiDto } from '../../types'
import type { JournalMetadata } from '../../types/journal'
import { localDateTimeToIso, localDateTimeValue } from '../../utils/healthOccurredAt'
import { captureDraft, type CaptureDraft } from '../ai-business/captureDraft'
import { fileDataUrl } from '../ai-business/draftFiles'
import { recognitionCommand, recognitionUrl, uploadRecognitionFile, type RecognitionJob } from '../ai-business/recognitionJobs'
import { prepareHealthImage } from '../health-attachments/prepareHealthImage'
import { caseService } from '../case-continuity/api'
import { materialRecordText, materialReview, mergeMaterialBlocks, visitContentHash, visitDocumentKey } from './materialReview'
import { visitMaterialIdentity, type LocalVisitDocument, type VisitMaterialBlock, type VisitMaterialDocument, type VisitMaterialSource, type VisitMaterials, type VisitMaterialsDeviceDraft } from './types'

type Saved = { eventId: string; recordId: string; attachmentIds: string[] }
type Stage = 'entry' | 'processing' | 'review' | 'saved'
const message = (error: unknown) => error instanceof Error ? error.message : '处理未完成，原件仍保留，请重试'
const wait = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const stop = () => { clearTimeout(timer); reject(signal.reason) }
  const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve() }, 1200)
  signal.addEventListener('abort', stop, { once: true })
  if (signal.aborted) stop()
})
const persisted = ({ file: _file, preview: _preview, job: _job, ...document }: LocalVisitDocument): VisitMaterialDocument => document
export function useVisitMaterials({ memberId, token, initialRecord, onSaved }: { memberId: string; token: string; initialRecord?: HealthEventRecordApiDto; onSaved: (message: string) => void }) {
  const accountId = useAppStore(store => store.authUser?.id ?? '')
  const key = 'visit-materials:' + accountId + ':' + memberId + ':' + (initialRecord?.id ?? 'new')
  const initial = initialRecord?.journal?.visit?.materials
  const [source, setSource] = useState<VisitMaterialSource>(initialRecord?.caseContext?.identity === 'external_ai' ? 'external_ai' : initial?.source ?? 'hospital')
  const [stage, setStage] = useState<Stage>(initial ? 'saved' : 'entry')
  const [documents, setDocuments] = useState<LocalVisitDocument[]>(initial?.documents ?? [])
  const [blocks, setBlocks] = useState<VisitMaterialBlock[]>(initial?.blocks ?? [])
  const [title, setTitle] = useState(initial?.title ?? '')
  const [occurredAt, setOccurredAt] = useState(initial?.occurredAt ? localDateTimeValue(new Date(initial.occurredAt)) : '')
  const [institution, setInstitution] = useState(initial?.institution ?? '')
  const [supplement, setSupplement] = useState(initial?.supplement ?? '')
  const [targetEventId, setTargetEventId] = useState(initialRecord?.eventId ?? '')
  const [targetRecordId, setTargetRecordId] = useState(initialRecord?.journal?.visit?.linkedVisitRecordId ?? initialRecord?.id ?? '')
  const [saved, setSaved] = useState<Saved | null>(initialRecord ? { eventId: initialRecord.eventId, recordId: initialRecord.id, attachmentIds: initialRecord.caseContext?.attachmentIds ?? [] } : null)
  const [originalsOnly, setOriginalsOnly] = useState(initial?.status === 'originals_only')
  const [draft, setDraft] = useState<CaptureDraft | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveLocked, setSaveLocked] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const credentials = useRef({ accountId, memberId, token }); credentials.current = { accountId, memberId, token }
  const alive = useRef(true), controllers = useRef(new Map<string, AbortController>()), previewUrls = useRef<string[]>([])
  const running = useRef(new Set<string>()), queue = useRef<LocalVisitDocument[]>([]), generation = useRef(0)
  const hashes = useRef(new Set(initial?.documents.flatMap(document => document.contentHash ? [document.contentHash] : []) ?? [])), loadedPreviews = useRef(new Set<string>())
  const requestId = useRef<string>(crypto.randomUUID()), lock = useRef(false), existingEdit = useRef(Boolean(initialRecord)), readOnlySaved = useRef(Boolean(initialRecord)), saveMode = useRef<VisitMaterials['status']>()
  const pendingSave = useRef<{ mode: VisitMaterials['status']; materials: VisitMaterials; content: string; journal: JournalMetadata; files: { name: string; mimeType: string; dataUrl: string }[] } | null>(null)
  const latest = useRef({ documents, blocks, source, title, occurredAt, institution, supplement, targetEventId, targetRecordId, stage })
  latest.current = { documents, blocks, source, title, occurredAt, institution, supplement, targetEventId, targetRecordId, stage }

  useEffect(() => {
    alive.current = true
    void captureDraft(key).then(value => { if (alive.current) { setDraft(value?.visitMaterials ? value : null); setHydrated(true) } }).catch(() => { if (alive.current) { setError('设备草稿暂不可用，离开前请先保存原件'); setHydrated(true) } })
    return () => { alive.current = false; generation.current++; controllers.current.forEach(controller => controller.abort()); previewUrls.current.forEach(url => URL.revokeObjectURL(url)) }
  }, [key])
  const deviceDraft = (mode?: VisitMaterials['status']): CaptureDraft => {
    const current = latest.current, files = current.documents.flatMap(document => document.file ? [document.file] : [])
    const metadata: VisitMaterialsDeviceDraft = {
      source: current.source, stage: current.stage === 'saved' ? 'review' : current.stage,
      title: current.title, occurredAt: current.occurredAt, institution: current.institution, supplement: current.supplement,
      targetEventId: current.targetEventId || undefined, targetRecordId: current.targetRecordId || undefined,
      documents: current.documents.map(document => ({ ...persisted(document), ...(document.file ? { fileIndex: files.indexOf(document.file) } : {}) })),
      blocks: current.blocks, saveLocked: lock.current, saveMode: mode ?? pendingSave.current?.mode, savedRecord: saved ?? undefined, editingExisting: existingEdit.current
    }
    return { text: '', files, occurredAt: current.occurredAt, timeUnknown: !current.occurredAt, requestId: requestId.current, updatedAt: Date.now(), visitMaterials: metadata }
  }
  useEffect(() => {
    if (!hydrated || stage === 'saved' || !documents.length || readOnlySaved.current) return
    const timer = setTimeout(() => { void captureDraft(key, deviceDraft()).catch(() => { if (alive.current) setError('设备草稿未保存，请先保存原件再离开') }) }, 350)
    return () => clearTimeout(timer)
  }, [hydrated, stage, documents, blocks, source, title, occurredAt, institution, supplement, targetEventId, targetRecordId, saveLocked, key])
  const updateDocument = (id: string, changes: Partial<LocalVisitDocument>) => {
    if (!alive.current || lock.current) return
    setDocuments(current => current.map(document => document.id === id ? { ...document, ...changes } : document))
  }
  useEffect(() => {
    if (!saved || stage !== 'saved') return
    const controller = new AbortController()
    for (const document of documents) {
      if (!document.mimeType?.startsWith('image/') || document.preview || !document.attachmentId || loadedPreviews.current.has(document.attachmentId)) continue
      loadedPreviews.current.add(document.attachmentId)
      void fetch('/api/events/' + encodeURIComponent(saved.eventId) + '/attachments/' + encodeURIComponent(document.attachmentId) + '/preview', { headers: { Authorization: 'Bearer ' + credentials.current.token }, signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error('预览暂不可用')
        const blob = await response.blob()
        if (controller.signal.aborted || !alive.current) return
        const url = URL.createObjectURL(blob); previewUrls.current.push(url); updateDocument(document.id, { preview: url })
      }).catch(() => { if (controller.signal.aborted && document.attachmentId) loadedPreviews.current.delete(document.attachmentId) })
    }
    return () => controller.abort()
  }, [saved?.recordId, stage, token])
  async function processDocument(document: LocalVisitDocument, epoch: number) {
    const controller = new AbortController(); controllers.current.set(document.id, controller)
    const timeout = setTimeout(() => controller.abort(new Error('本份资料整理较久，可以重试或先保存原件')), 180000)
    try {
      let jobId = document.jobId
      let job: RecognitionJob | undefined
      if (jobId) {
        job = await apiRequest<RecognitionJob>(recognitionUrl(memberId) + '/' + encodeURIComponent(jobId), { token: credentials.current.token, signal: controller.signal })
        if (['failed', 'paused', 'needs_review'].includes(job.state)) job = await recognitionCommand(memberId, credentials.current.token, jobId, 'retry')
      } else {
        const assetIds: string[] = []
        if (document.file) {
          updateDocument(document.id, { status: 'uploading' })
          let file = document.file
          if (/image\/hei[cf]/i.test(file.type)) {
            const prepared = await prepareHealthImage(file)
            const bytes = Uint8Array.from(atob(prepared.dataUrl.split(',')[1]), value => value.charCodeAt(0))
            file = new File([bytes], prepared.name, { type: prepared.mimeType })
            updateDocument(document.id, { preview: prepared.dataUrl })
          }
          assetIds.push(await uploadRecognitionFile(memberId, credentials.current.token, file, controller.signal))
        }
        controller.signal.throwIfAborted()
        jobId = crypto.randomUUID()
        updateDocument(document.id, { status: 'queued', jobId })
        job = await apiRequest<RecognitionJob>(recognitionUrl(memberId), { method: 'POST', token: credentials.current.token, signal: controller.signal, body: {
          id: jobId, mode: 'structured', scopeKey: 'visit-material:' + document.id,
          input: { id: document.id, kind: document.file ? 'image' : 'text', text: document.originalText ?? '', assetIds },
          options: { task: 'visit', sourceIdentity: visitMaterialIdentity(latest.current.source), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        } })
      }
      while (job && !['ready', 'needs_review', 'failed', 'discarded', 'paused'].includes(job.state)) {
        updateDocument(document.id, { job, jobId, status: job.state === 'queued' ? 'queued' : ['organizing', 'publishing'].includes(job.stage) ? 'organizing' : 'recognizing' })
        await wait(controller.signal)
        job = await apiRequest<RecognitionJob>(recognitionUrl(memberId) + '/' + encodeURIComponent(jobId!), { token: credentials.current.token, signal: controller.signal })
      }
      if (epoch !== generation.current || !alive.current || lock.current || !latest.current.documents.some(current => current.id === document.id)) return
      if (!job || !['ready', 'needs_review'].includes(job.state)) throw new Error(job?.error?.message ?? '本份资料暂未整理完成，可以单独重试')
      const result = materialReview(document, job, latest.current.source)
      updateDocument(document.id, { status: 'ready', job, jobId, recognizedText: result.recognizedText, error: result.warnings.join('；') || (job.state === 'needs_review' ? '部分内容不清楚，请对照原件' : '') })
      setBlocks(previous => mergeMaterialBlocks(previous, document.id, result.blocks).filter((block, index, all) => all.findIndex(other => other.text.replace(/\s/g, '') === block.text.replace(/\s/g, '') && other.quote.replace(/\s/g, '') === block.quote.replace(/\s/g, '')) === index))
      if (result.institution) setInstitution(previous => previous || result.institution)
      if (result.occurredAt) setOccurredAt(previous => previous || localDateTimeValue(new Date(result.occurredAt!)))
    } catch (cause) {
      if (epoch === generation.current && alive.current && !lock.current) updateDocument(document.id, { status: 'failed', error: message(controller.signal.aborted ? controller.signal.reason : cause) })
    } finally { clearTimeout(timeout); controllers.current.delete(document.id) }
  }
  function pump() {
    while (queue.current.length && running.current.size < 2) {
      const document = queue.current.shift()!, epoch = generation.current
      if (running.current.has(document.id)) continue
      running.current.add(document.id)
      void processDocument(document, epoch).finally(() => { running.current.delete(document.id); if (epoch === generation.current && !lock.current) pump() })
    }
  }
  const enqueue = (items: LocalVisitDocument[]) => { queue.current.push(...items); pump() }
  async function addFiles(selected: File[]) {
    if (lock.current || !selected.length) return
    setError(''); setNotice('')
    const current = latest.current.documents
    const unique = selected.filter((file, index) => selected.findIndex(other => visitDocumentKey(other) === visitDocumentKey(file)) === index && !current.some(document => document.file && visitDocumentKey(document.file) === visitDocumentKey(file)))
    if (!unique.length) { setNotice('这些原件已经在本次资料里'); return }
    if (current.length + unique.length > 24 || current.filter(document => document.kind === 'file').length + unique.length > 12 || current.reduce((sum, document) => sum + (document.file?.size ?? 0), 0) + unique.reduce((sum, file) => sum + file.size, 0) > 15 * 1024 * 1024) { setError('一次最多12份文件、总大小15 MB，请分批补充'); return }
    const files = unique.map(file => new File([file], file.name.replace(/[\\/\u0000-\u001f]/g, '').slice(0,120) || '资料原件', { type: file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : /\.hei[cf]$/i.test(file.name) ? 'image/heic' : /\.png$/i.test(file.name) ? 'image/png' : /\.webp$/i.test(file.name) ? 'image/webp' : 'image/jpeg'), lastModified: file.lastModified }))
    if (files.some(file => !['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type))) { setError('支持照片、截图与 PDF，请重新选择文件'); return }
    setNotice('正在读取原件…')
    const candidates = await Promise.all(files.map(async file => ({ file, contentHash: await visitContentHash(await fileDataUrl(file)) }))).catch(cause => { setError(message(cause)); return [] })
    if (!alive.current) return
    const added = candidates.filter(candidate => { if (hashes.current.has(candidate.contentHash)) return false; hashes.current.add(candidate.contentHash); return true }).map(({ file, contentHash }) => {
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
      if (preview) previewUrls.current.push(preview)
      return { id: crypto.randomUUID(), name: file.name, kind: 'file' as const, mimeType: file.type, file, preview, contentHash, status: 'preparing' as const }
    })
    setNotice(added.length < candidates.length ? '重复的原件已跳过，原资料仍保留' : '')
    if (!added.length) return
    setDocuments(previous => [...previous, ...added]); setStage('processing'); readOnlySaved.current = false; existingEdit.current = false
    enqueue(added)
  }
  function addText(text: string) {
    if (lock.current || !text.trim()) return
    if (text.length > 15000 || latest.current.documents.length >= 24) { setError('每段最多15000字，一次最多24份资料，请分段或分次保存'); return }
    const isLink = /^https?:\/\/\S+$/.test(text.trim())
    const document: LocalVisitDocument = { id: crypto.randomUUID(), name: isLink ? '问诊来源链接' : '粘贴对话 ' + (latest.current.documents.filter(item => item.kind === 'text').length + 1), kind: isLink ? 'link' : 'text', originalText: text.trim(), status: isLink ? 'ready' : 'queued' }
    setDocuments(previous => [...previous, document]); setStage('processing'); readOnlySaved.current = false; existingEdit.current = false; setError('')
    if (isLink) setNotice('已保留来源链接，正文需要另外粘贴或上传')
    else enqueue([document])
  }
  function retry(document: LocalVisitDocument) {
    if (lock.current || running.current.has(document.id)) return
    updateDocument(document.id, { status: 'queued', error: '' })
    enqueue([document])
  }
  function remove(document: LocalVisitDocument) {
    if (lock.current) return
    controllers.current.get(document.id)?.abort()
    queue.current = queue.current.filter(item => item.id !== document.id)
    setDocuments(previous => previous.filter(item => item.id !== document.id))
    setBlocks(previous => previous.filter(block => block.documentId !== document.id))
    if (document.jobId) void recognitionCommand(memberId, credentials.current.token, document.jobId, 'discard').catch(() => undefined)
    if (document.contentHash) hashes.current.delete(document.contentHash)
  }
  async function save(mode: VisitMaterials['status']) {
    if (saving || !latest.current.documents.length) return
    mode = saveMode.current ?? mode
    saveMode.current = mode
    setSaving(true); setError(''); lock.current = true; setSaveLocked(true)
    try {
      if (!pendingSave.current) {
        const current = latest.current
        const instant = current.occurredAt ? localDateTimeToIso(current.occurredAt) : undefined
        if (current.occurredAt && (!instant || Date.parse(instant) > Date.now())) throw new Error('请选择不晚于现在的实际就诊时间')
        const files = existingEdit.current ? [] : await Promise.all(current.documents.filter(document => document.file).map(async document => ({ name: document.name, mimeType: document.file!.type, dataUrl: await fileDataUrl(document.file!) })))
        const fileDocuments = current.documents.filter(document => document.file)
        const mapped = await Promise.all(current.documents.map(async document => {
          const file = files[fileDocuments.findIndex(item => item.id === document.id)]
          return { ...persisted(document), ...(file ? { contentHash: await visitContentHash(file.dataUrl) } : {}) }
        }))
        const defaultTitle = current.source === 'hospital' ? '医院就诊资料' : current.source === 'online_doctor' ? '在线问诊资料' : 'AI 问诊参考'
        const materials: VisitMaterials = { source: current.source, status: mode, title: current.title.trim() || defaultTitle, ...(instant ? { occurredAt: instant } : {}), institution: current.institution.trim(), supplement: current.supplement.trim(), documents: mapped, blocks: mode === 'reviewed' ? current.blocks : [] }
        const previousVisit = initialRecord?.journal?.visit
        const visitType = current.source === 'hospital' ? previousVisit?.visitType ?? 'other' : 'online_consultation'
        const journal: JournalMetadata = { categories: ['visit'], timePrecision: instant ? 'exact' : 'unknown', visit: { ...previousVisit, visitType, ...(visitType === 'other' ? { visitTypeOtherText: previousVisit?.visitTypeOtherText || '医院就诊' } : {}), materials, recognitionStatus: mode === 'reviewed' ? 'user_edited' : 'draft_unverified', ...(current.targetRecordId && current.targetRecordId !== saved?.recordId ? { linkedVisitRecordId: current.targetRecordId } : {}) } }
        pendingSave.current = { mode, materials, journal, files, content: materialRecordText(materials.title, materials.blocks, materials.supplement ?? '', mode === 'originals_only') }
      }
      const snapshot = pendingSave.current
      await captureDraft(key, deviceDraft(snapshot.mode)).catch(() => { if (alive.current) setNotice('本机暂不能保留草稿，正在保存原件') })
      let result: Saved
      if (existingEdit.current && saved) {
        const updated = await healthEventRecordService.update(saved.recordId, { content: snapshot.content, journal: snapshot.journal, ...(snapshot.materials.occurredAt ? { occurredAt: snapshot.materials.occurredAt } : {}) }, credentials.current.token)
        result = { eventId: updated.eventId, recordId: updated.id, attachmentIds: updated.caseContext?.attachmentIds ?? saved.attachmentIds }
      } else {
        result = await caseService.capture(memberId, credentials.current.token, { requestId: requestId.current, title: snapshot.materials.title, followUp: false, text: snapshot.content, occurredAt: snapshot.materials.occurredAt ?? new Date().toISOString(), timeUnknown: !snapshot.materials.occurredAt, eventId: latest.current.targetEventId || undefined, identity: visitMaterialIdentity(snapshot.materials.source), journal: snapshot.journal, files: snapshot.files })
      }
      if (!alive.current) return
      setSaved(result); setTitle(snapshot.materials.title); setOriginalsOnly(snapshot.mode === 'originals_only')
      const stored = await healthEventRecordService.list(result.eventId, credentials.current.token).then(records => records.find(record => record.id === result.recordId)).catch(() => undefined)
      if (!alive.current) return
      if (stored?.journal?.visit?.materials) setDocuments(previous => previous.map(document => ({ ...document, ...stored.journal!.visit!.materials!.documents.find(item => item.id === document.id) })))
      setStage('saved'); readOnlySaved.current = true
      await captureDraft(key, null).catch(() => undefined); setDraft(null)
      onSaved(snapshot.mode === 'originals_only' ? '就诊原件已保存，可在健康日历查看' : '就诊资料已保存，可在健康日历查看')
      pendingSave.current = null; lock.current = false; saveMode.current = undefined; setSaveLocked(false)
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status >= 400 && cause.status < 500) { pendingSave.current = null; lock.current = false; saveMode.current = undefined; setSaveLocked(false) }
      if (alive.current) setError(message(cause) + (pendingSave.current ? '。本次内容已锁定，重试保存不会重复创建资料。' : ''))
      if (!pendingSave.current) { lock.current = false; saveMode.current = undefined; setSaveLocked(false) }
    } finally { if (alive.current) setSaving(false) }
  }
  async function resumeDraft() {
    if (!draft?.visitMaterials) return
    const value = draft.visitMaterials
    const restored = value.documents.map(document => {
      const file = document.fileIndex === undefined ? undefined : draft.files[document.fileIndex]
      const preview = file?.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
      if (preview) previewUrls.current.push(preview)
      return { ...document, file, preview }
    })
    restored.forEach(document => { if (document.contentHash) hashes.current.add(document.contentHash) })
    setSource(value.source); setTitle(value.title); setOccurredAt(value.occurredAt); setInstitution(value.institution); setSupplement(value.supplement)
    setTargetEventId(value.targetEventId ?? ''); setTargetRecordId(value.targetRecordId ?? ''); setDocuments(restored); setBlocks(value.blocks); setStage(value.stage)
    setSaved(value.savedRecord ?? null); existingEdit.current = Boolean(value.editingExisting && value.savedRecord)
    requestId.current = draft.requestId; setDraft(null); readOnlySaved.current = false
    if (value.saveLocked) { lock.current = true; saveMode.current = value.saveMode; setSaveLocked(true); setNotice('上次保存结果尚未确认，请重试保存'); }
    else enqueue(restored.filter(document => !['ready','failed'].includes(document.status)))
  }
  async function retainDraft() { await captureDraft(key, deviceDraft()); }
  async function discardDraft() {
    generation.current++; controllers.current.forEach(controller => controller.abort()); queue.current = []
    for (const document of documents) if (document.jobId) void recognitionCommand(memberId, credentials.current.token, document.jobId, 'discard').catch(() => undefined)
    await captureDraft(key, null)
  }
  function chooseTarget(eventId: string, recordId = '', label = '', visitAt?: string) {
    setTargetEventId(eventId); setTargetRecordId(recordId); if (label) setTitle(label)
    if (visitAt) setOccurredAt(localDateTimeValue(new Date(visitAt)))
  }
  async function editSaved(organize: boolean) {
    if (!saved) return
    setError(''); existingEdit.current = true; readOnlySaved.current = false
    if (!organize) { setStage('review'); return }
    setStage('processing')
    try {
      const restored = await Promise.all(documents.map(async document => {
        if (document.kind !== 'file' || document.file) return document
        if (!document.attachmentId) throw new Error('原件信息尚未加载，请关闭后重试')
        const response = await fetch('/api/events/' + encodeURIComponent(saved.eventId) + '/attachments/' + encodeURIComponent(document.attachmentId) + '/content', { headers: { Authorization: 'Bearer ' + credentials.current.token } })
        if (!response.ok) throw new Error('原件暂不可用，请重试')
        const file = new File([await response.blob()], document.name, { type: document.mimeType }), preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
        if (preview) previewUrls.current.push(preview)
        return { ...document, file, preview }
      }))
      if (!alive.current) return
      setDocuments(restored); enqueue(restored.filter(document => document.kind !== 'link'))
    } catch (cause) { if (alive.current) setError(message(cause)) }
  }
  function appendSaved() {
    if (!saved) return
    setTargetEventId(saved.eventId); setTargetRecordId(targetRecordId || saved.recordId)
    setDocuments([]); setBlocks([]); setStage('entry'); setSaved(null)
    requestId.current = crypto.randomUUID(); existingEdit.current = false; readOnlySaved.current = false; setOriginalsOnly(false); saveMode.current = undefined
  }
  return { source, setSource, stage, setStage, documents, blocks, setBlocks, title, setTitle, occurredAt, setOccurredAt, institution, setInstitution, supplement, setSupplement, targetEventId, targetRecordId, saved, originalsOnly, draft, hydrated, saving, saveLocked, error, setError, notice, addFiles, addText, retry, remove, save, resumeDraft, retainDraft, discardDraft, chooseTarget, editSaved, appendSaved }
}

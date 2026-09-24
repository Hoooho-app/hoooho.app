import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImagePlus, LoaderCircle, RotateCcw, X } from 'lucide-react'
import { prepareHealthImage } from '../../../features/health-attachments/prepareHealthImage'
import { useDialogFocus } from '../../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../../hooks/usePageScrollLock'
import { quickRecordService, type QuickRecordPhotoDto } from '../../../services/quickRecords'

export type QuickRecordPhotoStatus = 'uploading' | 'uploaded' | 'failed'
export interface QuickRecordPhotoItem {
  localId: string
  serverId?: string
  file?: File
  name: string
  previewUrl: string
  status: QuickRecordPhotoStatus
  error?: string
}

export interface QuickRecordPhotoPayload { draftId: string; photoIds: string[] }

export const QUICK_RECORD_PHOTO_LIMIT = 10
export const remainingPhotoCapacity = (count: number, limit = QUICK_RECORD_PHOTO_LIMIT) => Math.max(0, limit - count)
export const hasUnreadyPhotos = (photos: readonly QuickRecordPhotoItem[]) => photos.some((photo) => photo.status !== 'uploaded')

const draftStorageKey = (memberId: string, namespace = 'default') => `hoooho-quick-record-photo-draft:${namespace}:${memberId}`

export function useQuickRecordPhotos(memberId?: string, token?: string, limit = QUICK_RECORD_PHOTO_LIMIT, namespace = 'default') {
  const [photos, setPhotos] = useState<QuickRecordPhotoItem[]>([])
  const [notice, setNotice] = useState('')
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const photosRef = useRef(photos)
  const draftIdRef = useRef('')
  const uploadVersionsRef = useRef(new Map<string, number>())
  photosRef.current = photos

  const ensureDraftId = () => {
    if (draftIdRef.current) return draftIdRef.current
    const existing = memberId ? sessionStorage.getItem(draftStorageKey(memberId, namespace)) : ''
    draftIdRef.current = existing || crypto.randomUUID().replaceAll('-', '')
    if (memberId) sessionStorage.setItem(draftStorageKey(memberId, namespace), draftIdRef.current)
    return draftIdRef.current
  }

  useEffect(() => {
    if (!memberId || !token) return
    const stored = sessionStorage.getItem(draftStorageKey(memberId, namespace))
    if (!stored || photosRef.current.length) return
    draftIdRef.current = stored
    let active = true
    void quickRecordService.listPhotos(stored, memberId, token).then(async (saved) => {
      const hydrated = await Promise.all(saved.map(async (photo) => {
        const blob = await quickRecordService.readPhoto(stored, photo.id, memberId, token)
        return { localId: photo.id, serverId: photo.id, name: photo.name, previewUrl: URL.createObjectURL(blob), status: 'uploaded' as const }
      }))
      if (active) setPhotos(hydrated)
      else hydrated.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
    }).catch(() => { if (active) setNotice('照片草稿暂时无法恢复，请稍后重试') })
    return () => { active = false }
  }, [memberId, namespace, token])

  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl)), [])

  const uploadItem = async (item: QuickRecordPhotoItem, sortOrder: number, version: number) => {
    if (!item.file || !memberId || !token) return
    try {
      const prepared = await prepareHealthImage(item.file)
      const saved = await quickRecordService.uploadPhoto(ensureDraftId(), { memberId, ...prepared, sortOrder }, token)
      if (uploadVersionsRef.current.get(item.localId) !== version) return
      setPhotos((current) => {
        const next = current.map((photo): QuickRecordPhotoItem => photo.localId === item.localId
          ? { ...photo, serverId: saved.id, status: 'uploaded', error: undefined }
          : photo)
        photosRef.current = next
        return next
      })
    } catch (reason) {
      if (uploadVersionsRef.current.get(item.localId) !== version) return
      setPhotos((current) => {
        const next = current.map((photo): QuickRecordPhotoItem => photo.localId === item.localId
          ? { ...photo, status: 'failed', error: reason instanceof Error ? reason.message : '上传失败，请重试' }
          : photo)
        photosRef.current = next
        return next
      })
    }
  }

  const beginUpload = (item: QuickRecordPhotoItem, sortOrder: number) => {
    const version = (uploadVersionsRef.current.get(item.localId) ?? 0) + 1
    uploadVersionsRef.current.set(item.localId, version)
    void uploadItem(item, sortOrder, version)
  }

  const chooseFiles = (files: FileList | null) => {
    if (!files?.length) return []
    const available = remainingPhotoCapacity(photosRef.current.length, limit)
    const selected = Array.from(files).slice(0, available)
    if (files.length > available) setNotice(limit === QUICK_RECORD_PHOTO_LIMIT ? '最多上传10张照片' : `最多上传${limit}张照片`)
    else setNotice('')
    const additions = selected.map((file): QuickRecordPhotoItem => ({
      localId: crypto.randomUUID(), file, name: file.name, previewUrl: URL.createObjectURL(file), status: 'uploading'
    }))
    const previousCount = photosRef.current.length
    const next = [...photosRef.current, ...additions]
    photosRef.current = next
    setPhotos(next)
    additions.forEach((item, index) => beginUpload(item, previousCount + index))
    return additions.map((item) => item.localId)
  }

  const retry = (localId: string) => {
    const item = photosRef.current.find((photo) => photo.localId === localId)
    if (!item || item.status !== 'failed') return
    const next = photosRef.current.map((photo): QuickRecordPhotoItem => photo.localId === localId ? { ...photo, status: 'uploading', error: undefined } : photo)
    photosRef.current = next
    setPhotos(next)
    beginUpload(item, photosRef.current.findIndex((photo) => photo.localId === localId))
  }

  const remove = (localId: string) => {
    const item = photosRef.current.find((photo) => photo.localId === localId)
    if (!item) return
    uploadVersionsRef.current.set(localId, (uploadVersionsRef.current.get(localId) ?? 0) + 1)
    URL.revokeObjectURL(item.previewUrl)
    const next = photosRef.current.filter((photo) => photo.localId !== localId)
    photosRef.current = next
    setPhotos(next)
    setPreviewIndex(null)
    if (item.serverId && memberId && token && draftIdRef.current) void quickRecordService.deletePhoto(draftIdRef.current, item.serverId, memberId, token).catch(() => undefined)
  }

  const clearLocal = () => {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
    uploadVersionsRef.current.clear()
    photosRef.current = []
    setPhotos([])
    setPreviewIndex(null)
    setNotice('')
    if (memberId) sessionStorage.removeItem(draftStorageKey(memberId, namespace))
    draftIdRef.current = ''
  }

  const cancel = () => {
    const draftId = draftIdRef.current
    clearLocal()
    if (draftId && memberId && token) void quickRecordService.cancelPhotos(draftId, memberId, token).catch(() => undefined)
  }

  const payload = (): QuickRecordPhotoPayload => ({
    draftId: draftIdRef.current,
    photoIds: photosRef.current.filter((photo) => photo.status === 'uploaded' && photo.serverId).map((photo) => photo.serverId!)
  })

  return { photos, notice, previewIndex, setPreviewIndex, chooseFiles, retry, remove, cancel, clearAfterSave: clearLocal, payload, blocked: hasUnreadyPhotos(photos) }
}

export function QuickRecordPhotos({ model, limit = QUICK_RECORD_PHOTO_LIMIT, showAddButton = true }: { model: ReturnType<typeof useQuickRecordPhotos>; limit?: number; showAddButton?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const lightboxRef = useRef<HTMLDivElement>(null)
  const { photos, notice, previewIndex } = model
  const selected = previewIndex === null ? null : photos[previewIndex] ?? null
  useDialogFocus(Boolean(selected), lightboxRef)
  usePageScrollLock(Boolean(selected))
  useEffect(() => {
    if (!selected) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') model.setPreviewIndex(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [model, selected])
  return <>
    <div className="quick-record-photos" data-empty={photos.length === 0}>
      <div className="quick-record-photos__heading"><strong>上传照片</strong><span>{photos.length}/{limit}</span></div>
      <div className="quick-record-photos__rail">
        {photos.map((photo, index) => <div className="quick-record-photo" data-status={photo.status} key={photo.localId}>
          <button aria-label={`查看照片 ${index + 1}`} className="quick-record-photo__preview" onClick={() => model.setPreviewIndex(index)} type="button"><img alt="" src={photo.previewUrl} /></button>
          {photo.status === 'uploading' && <span aria-label="上传中" className="quick-record-photo__status"><LoaderCircle className="is-spinning" size={17} /></span>}
          {photo.status === 'failed' && <div className="quick-record-photo__failed"><span>上传失败</span><button aria-label={`重试上传 ${photo.name}`} onClick={() => model.retry(photo.localId)} type="button"><RotateCcw size={14} />重试</button><button aria-label={`移除上传失败的照片 ${photo.name}`} onClick={() => model.remove(photo.localId)} type="button"><X size={14} />移除</button></div>}
          {photo.status !== 'failed' && <button aria-label={`删除照片 ${index + 1}`} className="quick-record-photo__delete" onClick={() => model.remove(photo.localId)} type="button"><X size={13} /></button>}
        </div>)}
        {showAddButton && photos.length < limit && <button aria-label={photos.length ? '继续上传照片' : '上传照片'} className="quick-record-photo-add" onClick={() => inputRef.current?.click()} type="button"><ImagePlus aria-hidden="true" size={25} strokeWidth={1.7} /></button>}
      </div>
      {showAddButton && <input ref={inputRef} accept="image/jpeg,image/png,image/webp" hidden multiple onChange={(event) => { model.chooseFiles(event.target.files); event.currentTarget.value = '' }} type="file" />}
      {notice && <p className="quick-record-photo-notice" role="status">{notice}</p>}
      {model.blocked && <p className="quick-record-photo-error" role="alert">{photos.some((photo) => photo.status === 'failed') ? '有照片上传失败，请重试或移除' : '照片上传中，请稍候'}</p>}
    </div>
    {selected && <div aria-label="照片预览" aria-modal="true" className="quick-record-photo-lightbox" ref={lightboxRef} role="dialog" tabIndex={-1}>
      <button aria-label="关闭大图预览" className="quick-record-photo-lightbox__close" onClick={() => model.setPreviewIndex(null)} type="button"><X size={25} /></button>
      {photos.length > 1 && <button aria-label="上一张照片" className="quick-record-photo-lightbox__previous" onClick={() => model.setPreviewIndex((previewIndex! - 1 + photos.length) % photos.length)} type="button"><ChevronLeft size={30} /></button>}
      <img alt={`照片 ${previewIndex! + 1}`} src={selected.previewUrl} />
      {photos.length > 1 && <button aria-label="下一张照片" className="quick-record-photo-lightbox__next" onClick={() => model.setPreviewIndex((previewIndex! + 1) % photos.length)} type="button"><ChevronRight size={30} /></button>}
      <span>{previewIndex! + 1}/{photos.length}</span>
    </div>}
  </>
}

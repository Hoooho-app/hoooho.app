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
export const remainingPhotoCapacity = (count: number) => Math.max(0, QUICK_RECORD_PHOTO_LIMIT - count)
export const hasUnreadyPhotos = (photos: readonly QuickRecordPhotoItem[]) => photos.some((photo) => photo.status !== 'uploaded')

const draftStorageKey = (memberId: string) => `hoooho-quick-record-photo-draft:${memberId}`

export function useQuickRecordPhotos(memberId?: string, token?: string) {
  const [photos, setPhotos] = useState<QuickRecordPhotoItem[]>([])
  const [notice, setNotice] = useState('')
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const photosRef = useRef(photos)
  const draftIdRef = useRef('')
  photosRef.current = photos

  const ensureDraftId = () => {
    if (draftIdRef.current) return draftIdRef.current
    const existing = memberId ? sessionStorage.getItem(draftStorageKey(memberId)) : ''
    draftIdRef.current = existing || crypto.randomUUID().replaceAll('-', '')
    if (memberId) sessionStorage.setItem(draftStorageKey(memberId), draftIdRef.current)
    return draftIdRef.current
  }

  useEffect(() => {
    if (!memberId || !token) return
    const stored = sessionStorage.getItem(draftStorageKey(memberId))
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
  }, [memberId, token])

  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl)), [])

  const uploadItem = async (item: QuickRecordPhotoItem, sortOrder: number) => {
    if (!item.file || !memberId || !token) return
    try {
      const prepared = await prepareHealthImage(item.file)
      const saved = await quickRecordService.uploadPhoto(ensureDraftId(), { memberId, ...prepared, sortOrder }, token)
      setPhotos((current) => current.map((photo) => photo.localId === item.localId
        ? { ...photo, serverId: saved.id, status: 'uploaded', error: undefined }
        : photo))
    } catch (reason) {
      setPhotos((current) => current.map((photo) => photo.localId === item.localId
        ? { ...photo, status: 'failed', error: reason instanceof Error ? reason.message : '上传失败，请重试' }
        : photo))
    }
  }

  const chooseFiles = (files: FileList | null) => {
    if (!files?.length) return
    const available = remainingPhotoCapacity(photosRef.current.length)
    const selected = Array.from(files).slice(0, available)
    if (files.length > available) setNotice('最多上传10张照片')
    else setNotice('')
    const additions = selected.map((file): QuickRecordPhotoItem => ({
      localId: crypto.randomUUID(), file, name: file.name, previewUrl: URL.createObjectURL(file), status: 'uploading'
    }))
    setPhotos((current) => [...current, ...additions])
    additions.forEach((item, index) => void uploadItem(item, photosRef.current.length + index))
  }

  const retry = (localId: string) => {
    const item = photosRef.current.find((photo) => photo.localId === localId)
    if (!item) return
    setPhotos((current) => current.map((photo) => photo.localId === localId ? { ...photo, status: 'uploading', error: undefined } : photo))
    void uploadItem(item, photosRef.current.findIndex((photo) => photo.localId === localId))
  }

  const remove = (localId: string) => {
    const item = photosRef.current.find((photo) => photo.localId === localId)
    if (!item) return
    URL.revokeObjectURL(item.previewUrl)
    setPhotos((current) => current.filter((photo) => photo.localId !== localId))
    setPreviewIndex(null)
    if (item.serverId && memberId && token && draftIdRef.current) void quickRecordService.deletePhoto(draftIdRef.current, item.serverId, memberId, token).catch(() => undefined)
  }

  const clearLocal = () => {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
    setPhotos([])
    setPreviewIndex(null)
    setNotice('')
    if (memberId) sessionStorage.removeItem(draftStorageKey(memberId))
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

export function QuickRecordPhotos({ model }: { model: ReturnType<typeof useQuickRecordPhotos> }) {
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
      <div className="quick-record-photos__heading"><strong>上传照片</strong><span>{photos.length}/10</span></div>
      <div className="quick-record-photos__rail">
        {photos.map((photo, index) => <div className="quick-record-photo" data-status={photo.status} key={photo.localId}>
          <button aria-label={`查看照片 ${index + 1}`} className="quick-record-photo__preview" onClick={() => model.setPreviewIndex(index)} type="button"><img alt="" src={photo.previewUrl} /></button>
          {photo.status === 'uploading' && <span aria-label="上传中" className="quick-record-photo__status"><LoaderCircle className="is-spinning" size={17} /></span>}
          {photo.status === 'failed' && <button aria-label={`重试上传 ${photo.name}`} className="quick-record-photo__status" onClick={() => model.retry(photo.localId)} type="button"><RotateCcw size={16} /></button>}
          <button aria-label={`删除照片 ${index + 1}`} className="quick-record-photo__delete" onClick={() => model.remove(photo.localId)} type="button"><X size={13} /></button>
        </div>)}
        {photos.length < QUICK_RECORD_PHOTO_LIMIT && <button aria-label={photos.length ? '继续上传照片' : '上传照片'} className="quick-record-photo-add" onClick={() => inputRef.current?.click()} type="button"><ImagePlus aria-hidden="true" size={25} strokeWidth={1.7} /></button>}
      </div>
      <input ref={inputRef} accept="image/jpeg,image/png,image/webp" hidden multiple onChange={(event) => { model.chooseFiles(event.target.files); event.currentTarget.value = '' }} type="file" />
      {notice && <p className="quick-record-photo-notice" role="status">{notice}</p>}
      {model.blocked && <p className="quick-record-photo-error" role="alert">请重试或删除上传失败的照片后再保存</p>}
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

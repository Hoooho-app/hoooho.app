import { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, RefreshCw, ZoomIn } from 'lucide-react'
import { AvatarPhotoError, createAvatarPhotoPreview, prepareAvatarPhoto, type AvatarPhotoCropSelection } from '../../utils/prepareAvatarPhoto'
import { decodeImageAsset } from '../../utils/decodeImageAsset'
import { cycleClayAvatar, type ClayAvatarConfig } from '../../utils/clayAvatar'
import { ClayAvatar } from '../common/ClayAvatar'
import { BottomSheetSurface, HohoButton } from '../design-system'

export type FamilyAvatarMode = 'cartoon' | 'photo'

interface FamilyAvatarEditorProps {
  compact?: boolean
  config: ClayAvatarConfig
  disabled?: boolean
  language?: string
  mode: FamilyAvatarMode
  name: string
  onConfigChange: (config: ClayAvatarConfig) => void
  onError: (message: string) => void
  onModeChange: (mode: FamilyAvatarMode) => void
  onPhotoChange: (photo: string) => void
  onProcessingChange?: (processing: boolean) => void
  photo: string
}

const copy = {
  zh: {
    cartoon: '卡通形象', photo: '照片', change: '换一个',
    upload: '上传照片头像', replace: '更换照片头像', photoAlt: '照片头像', processing: '正在处理照片…',
    unsupported: '暂不支持这种照片格式', unreadable: '无法读取这张照片，请选择其他照片', photoError: '照片处理失败，请重新选择',
    cropTitle: '调整照片', cropHint: '拖动照片调整位置，使用滑杆缩放', cancel: '取消', confirm: '使用这张照片', zoom: '缩放照片'
  },
  en: {
    cartoon: 'Cartoon avatar', photo: 'Photo avatar', change: 'Choose another avatar',
    upload: 'Upload photo avatar', replace: 'Replace photo avatar', photoAlt: 'Photo avatar', processing: 'Processing photo…',
    unsupported: 'This photo format is not supported yet.', unreadable: 'This photo could not be read. Choose another photo.', photoError: 'The photo could not be processed. Please try again.',
    cropTitle: 'Adjust photo', cropHint: 'Drag to reposition and use the slider to zoom.', cancel: 'Cancel', confirm: 'Use photo', zoom: 'Photo zoom'
  },
  ar: {
    cartoon: 'صورة كرتونية', photo: 'صورة شخصية', change: 'تغيير الصورة الكرتونية',
    upload: 'رفع صورة شخصية', replace: 'تغيير الصورة الشخصية', photoAlt: 'الصورة الشخصية', processing: 'جارٍ معالجة الصورة…',
    unsupported: 'تنسيق هذه الصورة غير مدعوم حاليًا.', unreadable: 'تعذرت قراءة هذه الصورة. اختر صورة أخرى.', photoError: 'فشلت معالجة الصورة. حاول مرة أخرى.',
    cropTitle: 'ضبط الصورة', cropHint: 'اسحب الصورة لتغيير موضعها واستخدم شريط التمرير للتكبير.', cancel: 'إلغاء', confirm: 'استخدام الصورة', zoom: 'تكبير الصورة'
  }
} as const

export function getFamilyAvatarCopy(language: string) {
  if (language.toLowerCase().startsWith('ar')) return copy.ar
  if (language.toLowerCase().startsWith('en')) return copy.en
  return copy.zh
}

export function FamilyAvatarEditor({ compact = false, config, disabled = false, language: languageOverride, mode, name, onConfigChange, onError, onModeChange, onPhotoChange, onProcessingChange, photo }: FamilyAvatarEditorProps) {
  const photoInputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef(0)
  const [processing, setProcessing] = useState(false)
  const [crop, setCrop] = useState<{ file: File; preview: string } | null>(null)
  const [selection, setSelection] = useState<AvatarPhotoCropSelection>({ offsetX: 0, offsetY: 0, zoom: 1 })
  const dragRef = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null)
  const [displayedPhoto, setDisplayedPhoto] = useState(photo)
  const language = languageOverride ?? (typeof document === 'undefined' ? 'zh' : document.documentElement.lang || navigator.language || 'zh')
  const text = useMemo(() => getFamilyAvatarCopy(language), [language])
  const isRtl = language.toLowerCase().startsWith('ar')

  useEffect(() => () => {
    requestRef.current += 1
    onProcessingChange?.(false)
  }, [onProcessingChange])

  useEffect(() => {
    if (!photo) {
      setDisplayedPhoto('')
      return
    }
    let active = true
    void decodeImageAsset(photo, 'high').then(() => {
      if (active) setDisplayedPhoto(photo)
    }).catch(() => undefined)
    return () => { active = false }
  }, [photo])

  const setPhotoProcessing = (value: boolean) => {
    setProcessing(value)
    onProcessingChange?.(value)
  }

  const selectPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const request = ++requestRef.current
    setPhotoProcessing(true)
    onError('')
    try {
      const preview = await createAvatarPhotoPreview(file)
      if (request !== requestRef.current) return
      setSelection({ offsetX: 0, offsetY: 0, zoom: 1 })
      setCrop({ file, preview: preview.src })
      onError('')
    } catch (error) {
      if (request !== requestRef.current) return
      if (error instanceof AvatarPhotoError) {
        onError(error.reason === 'unsupported' ? text.unsupported : error.reason === 'unreadable' ? text.unreadable : text.photoError)
      } else {
        onError(text.photoError)
      }
    } finally {
      if (request === requestRef.current) setPhotoProcessing(false)
    }
  }

  const confirmCrop = async () => {
    if (!crop || processing) return
    const request = ++requestRef.current
    setPhotoProcessing(true)
    onError('')
    try {
      const prepared = await prepareAvatarPhoto(crop.file, selection)
      await decodeImageAsset(prepared, 'high')
      if (request !== requestRef.current) return
      onPhotoChange(prepared)
      onModeChange('photo')
      setCrop(null)
    } catch (error) {
      if (request !== requestRef.current) return
      onError(error instanceof AvatarPhotoError && error.reason === 'unsupported' ? text.unsupported : error instanceof AvatarPhotoError && error.reason === 'unreadable' ? text.unreadable : text.photoError)
    } finally {
      if (request === requestRef.current) setPhotoProcessing(false)
    }
  }

  const moveCrop = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const limit = Math.max(selection.zoom - 1, 0.01)
    setSelection((current) => ({
      ...current,
      offsetX: Math.min(Math.max(drag.offsetX - (event.clientX - drag.x) / 120 / limit, -1), 1),
      offsetY: Math.min(Math.max(drag.offsetY - (event.clientY - drag.y) / 120 / limit, -1), 1)
    }))
  }

  const changeAvatar = () => {
    onConfigChange(cycleClayAvatar(config))
    onError('')
  }

  return (
    <section className="flex flex-col items-center" dir={isRtl ? 'rtl' : 'ltr'} aria-label={mode === 'cartoon' ? text.cartoon : text.photo}>
      {mode === 'cartoon' ? (
        <button
            aria-label={text.change}
            className="group flex flex-col items-center gap-1.5 rounded-control text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            disabled={disabled || processing}
            title={text.change}
            type="button"
            onClick={changeAvatar}
          >
            <span className={`relative block ${compact ? 'h-20 w-20' : 'h-28 w-28'}`}>
              <ClayAvatar className={`${compact ? 'h-20 w-20' : 'h-28 w-28'} border-2 border-primary bg-surface shadow-card`} config={config} language={language} name={name || text.cartoon} />
              <span className={`absolute bottom-0 end-0 grid place-items-center rounded-full border-2 border-surface bg-primary text-white shadow-card transition-transform duration-150 group-hover:scale-105 ${compact ? 'h-8 w-8' : 'h-11 w-11'}`}>
              <RefreshCw aria-hidden="true" size={compact ? 16 : 20} strokeWidth={1.9} />
              </span>
            </span>
            <span>{text.change}</span>
          </button>
      ) : (
        <button
          aria-label={photo ? text.replace : text.upload}
          aria-busy={processing}
          className="relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
          disabled={disabled}
          type="button"
          onClick={() => photoInputRef.current?.click()}
        >
          <span className={`inline-flex overflow-hidden rounded-full border-2 border-primary bg-surface shadow-card ${compact ? 'h-20 w-20' : 'h-28 w-28'}`}>
            {displayedPhoto ? (
              <img alt={text.photoAlt} className="h-full w-full object-cover" decoding="async" src={displayedPhoto} />
            ) : (
              <span className={`inline-flex items-center justify-center rounded-full bg-primary-soft text-primary ${compact ? 'h-20 w-20' : 'h-28 w-28'}`}>
                <Camera aria-hidden="true" size={compact ? 28 : 34} strokeWidth={1.6} />
              </span>
            )}
          </span>
          {photo && <span className="absolute bottom-0 end-0 grid h-11 w-11 place-items-center rounded-full border-2 border-surface bg-primary text-white shadow-card"><Camera aria-hidden="true" size={19} strokeWidth={1.8} /></span>}
        </button>
      )}
      <input ref={photoInputRef} accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="hidden" disabled={disabled} type="file" onChange={(event) => void selectPhoto(event)} />

      <div className="min-h-5" aria-live="polite" role="status">
        {processing && <p className="mt-1 text-xs text-text-secondary">{text.processing}</p>}
      </div>

      <div className={`${compact ? 'mt-1 w-44' : 'mt-2 w-48'} grid grid-cols-2 overflow-hidden rounded-control border border-border-calm bg-surface`} aria-label={text.cartoon}>
        {([['cartoon', text.cartoon], ['photo', text.photo]] as const).map(([value, label]) => (
          <button
            aria-pressed={mode === value}
            className={`min-h-11 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${mode === value ? 'bg-primary-soft font-semibold text-primary' : 'text-text-secondary'}`}
            disabled={disabled || processing}
            key={value}
            type="button"
            onClick={() => { onModeChange(value); onError('') }}
          >
            {label}
          </button>
        ))}
      </div>

      <BottomSheetSurface
        footer={<div className="grid grid-cols-2 gap-3"><HohoButton variant="secondary" onClick={() => setCrop(null)}>{text.cancel}</HohoButton><HohoButton loading={processing} onClick={() => void confirmCrop()}>{text.confirm}</HohoButton></div>}
        label={text.cropTitle}
        onClose={() => { if (!processing) setCrop(null) }}
        open={Boolean(crop)}
        title={text.cropTitle}
      >
        {crop && <div className="space-y-4">
          <p className="text-sm text-text-secondary">{text.cropHint}</p>
          <div
            className="relative mx-auto aspect-square w-full max-w-72 touch-none overflow-hidden rounded-card bg-primary-soft"
            onPointerDown={(event) => { dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: selection.offsetX, offsetY: selection.offsetY }; event.currentTarget.setPointerCapture(event.pointerId) }}
            onPointerMove={moveCrop}
            onPointerUp={(event) => { dragRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId) }}
          >
            <img alt="" className="h-full w-full select-none object-cover" draggable={false} src={crop.preview} style={{ transform: `scale(${selection.zoom}) translate(${-selection.offsetX * 16}%, ${-selection.offsetY * 16}%)` }} />
            <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/90 shadow-[0_0_0_999px_rgba(15,49,45,0.28)]" />
          </div>
          <label className="flex items-center gap-3 text-sm font-medium"><ZoomIn aria-hidden="true" className="text-primary" size={20} /><span className="sr-only">{text.zoom}</span><input aria-label={text.zoom} className="w-full accent-primary" max="3" min="1" step="0.05" type="range" value={selection.zoom} onChange={(event) => setSelection((current) => ({ ...current, zoom: Number(event.target.value) }))} /></label>
        </div>}
      </BottomSheetSurface>
    </section>
  )
}

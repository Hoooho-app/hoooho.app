import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, RefreshCw } from 'lucide-react'
import { AvatarPhotoError, prepareAvatarPhoto } from '../../utils/prepareAvatarPhoto'
import { cycleClayAvatar, type ClayAvatarConfig } from '../../utils/clayAvatar'
import { ClayAvatar } from '../common/ClayAvatar'

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
    cartoon: '卡通头像', photo: '照片头像', change: '换一个头像',
    upload: '上传照片头像', replace: '更换照片头像', photoAlt: '照片头像', processing: '正在处理照片…',
    unsupported: '暂不支持这种照片格式', unreadable: '无法读取这张照片，请选择其他照片', photoError: '照片处理失败，请重新选择'
  },
  en: {
    cartoon: 'Cartoon avatar', photo: 'Photo avatar', change: 'Choose another avatar',
    upload: 'Upload photo avatar', replace: 'Replace photo avatar', photoAlt: 'Photo avatar', processing: 'Processing photo…',
    unsupported: 'This photo format is not supported yet.', unreadable: 'This photo could not be read. Choose another photo.', photoError: 'The photo could not be processed. Please try again.'
  },
  ar: {
    cartoon: 'صورة كرتونية', photo: 'صورة شخصية', change: 'تغيير الصورة الكرتونية',
    upload: 'رفع صورة شخصية', replace: 'تغيير الصورة الشخصية', photoAlt: 'الصورة الشخصية', processing: 'جارٍ معالجة الصورة…',
    unsupported: 'تنسيق هذه الصورة غير مدعوم حاليًا.', unreadable: 'تعذرت قراءة هذه الصورة. اختر صورة أخرى.', photoError: 'فشلت معالجة الصورة. حاول مرة أخرى.'
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
  const language = languageOverride ?? (typeof document === 'undefined' ? 'zh' : document.documentElement.lang || navigator.language || 'zh')
  const text = useMemo(() => getFamilyAvatarCopy(language), [language])
  const isRtl = language.toLowerCase().startsWith('ar')

  useEffect(() => () => {
    requestRef.current += 1
    onProcessingChange?.(false)
  }, [onProcessingChange])

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
      const prepared = await prepareAvatarPhoto(file)
      if (request !== requestRef.current) return
      onPhotoChange(prepared)
      onModeChange('photo')
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

  const changeAvatar = () => {
    onConfigChange(cycleClayAvatar(config))
    onError('')
  }

  return (
    <section className="flex flex-col items-center" dir={isRtl ? 'rtl' : 'ltr'} aria-label={mode === 'cartoon' ? text.cartoon : text.photo}>
      {mode === 'cartoon' ? (
        <div className={`relative ${compact ? 'h-20 w-20' : 'h-28 w-28'}`}>
          <ClayAvatar className={`${compact ? 'h-20 w-20' : 'h-28 w-28'} border-2 border-primary bg-surface shadow-card`} config={config} language={language} name={name || text.cartoon} />
          <button
            aria-label={text.change}
            className="absolute bottom-0 end-0 grid min-h-11 min-w-11 place-items-center rounded-full text-white transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95"
            disabled={disabled || processing}
            title={text.change}
            type="button"
            onClick={changeAvatar}
          >
            <span className={`grid place-items-center rounded-full border-2 border-surface bg-primary shadow-card ${compact ? 'h-8 w-8' : 'h-11 w-11'}`}>
              <RefreshCw aria-hidden="true" size={compact ? 16 : 20} strokeWidth={1.9} />
            </span>
          </button>
        </div>
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
            {photo ? (
              <img alt={text.photoAlt} className="h-full w-full object-cover" src={photo} />
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
    </section>
  )
}

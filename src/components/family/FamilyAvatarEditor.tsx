import { ChangeEvent, useMemo, useRef } from 'react'
import { Camera, ChevronLeft, ChevronRight } from 'lucide-react'
import { prepareAvatarPhoto } from '../../utils/prepareAvatarPhoto'
import {
  clayFaceVariants,
  clayHairVariants,
  clayOutfitVariants,
  cycleClayAvatarPart,
  type ClayAvatarConfig,
  type ClayAvatarPart
} from '../../utils/clayAvatar'
import { ClayAvatar } from '../common/ClayAvatar'

export type FamilyAvatarMode = 'cartoon' | 'photo'

interface FamilyAvatarEditorProps {
  config: ClayAvatarConfig
  disabled?: boolean
  language?: string
  mode: FamilyAvatarMode
  name: string
  onConfigChange: (config: ClayAvatarConfig) => void
  onError: (message: string) => void
  onModeChange: (mode: FamilyAvatarMode) => void
  onPhotoChange: (photo: string) => void
  photo: string
}

const copy = {
  zh: {
    cartoon: '卡通头像', photo: '照片头像', hint: '已自动生成，可分别调整',
    hair: '头发', face: '脸', outfit: '衣服', previous: '上一个', next: '下一个',
    upload: '上传照片头像', replace: '更换照片头像', photoAlt: '照片头像', photoError: '照片处理失败，请重新选择',
    hairOptions: ['黑色紧密卷发', '棕色侧分短发', '金色短发', '银色短发', '棕色齐肩发', '棕色柔和长发', '棕色马尾', '棕色丸子头', '黑色辫发', '黑色圆形卷发', '银色中长发', '银色柔和卷发'],
    faceOptions: ['深肤色', '暖肤色', '浅肤色'], outfitOptions: ['Hoooho 青绿色', '珊瑚色', '鼠尾草绿']
  },
  en: {
    cartoon: 'Cartoon avatar', photo: 'Photo avatar', hint: 'Generated automatically. Adjust each part.',
    hair: 'Hair', face: 'Face', outfit: 'Outfit', previous: 'Previous', next: 'Next',
    upload: 'Upload photo avatar', replace: 'Replace photo avatar', photoAlt: 'Photo avatar', photoError: 'The photo could not be processed. Choose another photo.',
    hairOptions: ['Black tight curls', 'Brown side part', 'Golden short hair', 'Silver short hair', 'Brown shoulder-length hair', 'Brown soft long hair', 'Brown ponytail', 'Brown bun', 'Black braids', 'Black round curls', 'Silver medium hair', 'Silver soft waves'],
    faceOptions: ['Deep skin', 'Warm skin', 'Light skin'], outfitOptions: ['Hoooho teal', 'Coral', 'Sage green']
  },
  ar: {
    cartoon: 'صورة كرتونية', photo: 'صورة شخصية', hint: 'تم إنشاؤها تلقائيًا، ويمكن تعديل كل جزء',
    hair: 'الشعر', face: 'الوجه', outfit: 'الملابس', previous: 'السابق', next: 'التالي',
    upload: 'رفع صورة شخصية', replace: 'تغيير الصورة الشخصية', photoAlt: 'الصورة الشخصية', photoError: 'تعذرت معالجة الصورة. اختر صورة أخرى.',
    hairOptions: ['تجعيدات سوداء ضيقة', 'فرق جانبي بني', 'شعر ذهبي قصير', 'شعر فضي قصير', 'شعر بني حتى الكتفين', 'شعر بني طويل ناعم', 'ذيل حصان بني', 'كعكة بنية', 'ضفائر سوداء', 'تجعيدات سوداء مستديرة', 'شعر فضي متوسط', 'تموجات فضية ناعمة'],
    faceOptions: ['بشرة داكنة', 'بشرة دافئة', 'بشرة فاتحة'], outfitOptions: ['فيروزي Hoooho', 'مرجاني', 'أخضر مريمي']
  }
} as const

export function getFamilyAvatarCopy(language: string) {
  if (language.toLowerCase().startsWith('ar')) return copy.ar
  if (language.toLowerCase().startsWith('en')) return copy.en
  return copy.zh
}

export function FamilyAvatarEditor({ config, disabled = false, language: languageOverride, mode, name, onConfigChange, onError, onModeChange, onPhotoChange, photo }: FamilyAvatarEditorProps) {
  const photoInputRef = useRef<HTMLInputElement>(null)
  const language = languageOverride ?? (typeof document === 'undefined' ? 'zh' : document.documentElement.lang || navigator.language || 'zh')
  const text = useMemo(() => getFamilyAvatarCopy(language), [language])
  const isRtl = language.toLowerCase().startsWith('ar')

  const selectPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      onPhotoChange(await prepareAvatarPhoto(file))
      onModeChange('photo')
      onError('')
    } catch (error) {
      onError(error instanceof Error ? error.message : text.photoError)
    }
  }

  const rows = [
    { label: text.hair, part: 'hairVariant' as const, options: clayHairVariants, labels: text.hairOptions },
    { label: text.face, part: 'faceVariant' as const, options: clayFaceVariants, labels: text.faceOptions },
    { label: text.outfit, part: 'outfitVariant' as const, options: clayOutfitVariants, labels: text.outfitOptions }
  ]

  const changePart = (part: ClayAvatarPart, direction: -1 | 1) => {
    onConfigChange(cycleClayAvatarPart(config, part, direction))
    onError('')
  }

  return (
    <section className="flex flex-col items-center" dir={isRtl ? 'rtl' : 'ltr'} aria-label={mode === 'cartoon' ? text.cartoon : text.photo}>
      {mode === 'cartoon' ? (
        <span className="inline-flex overflow-hidden rounded-full border-2 border-primary bg-surface p-0.5 shadow-card">
          <ClayAvatar className="h-28 w-28" config={config} language={language} name={name || text.cartoon} />
        </span>
      ) : (
        <button
          aria-label={photo ? text.replace : text.upload}
          className="relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
          disabled={disabled}
          type="button"
          onClick={() => photoInputRef.current?.click()}
        >
          <span className="inline-flex overflow-hidden rounded-full border-2 border-primary bg-surface p-0.5 shadow-card">
            {photo ? (
              <img alt={text.photoAlt} className="h-28 w-28 rounded-full object-cover" src={photo} />
            ) : (
              <span className="inline-flex h-28 w-28 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Camera aria-hidden="true" size={34} strokeWidth={1.6} />
              </span>
            )}
          </span>
          {photo && <span className="absolute bottom-0 end-0 grid h-9 w-9 place-items-center rounded-full border-2 border-surface bg-primary text-white shadow-card"><Camera aria-hidden="true" size={18} strokeWidth={1.8} /></span>}
        </button>
      )}
      <input ref={photoInputRef} accept="image/jpeg,image/png,image/webp" className="hidden" disabled={disabled} type="file" onChange={(event) => void selectPhoto(event)} />

      {mode === 'cartoon' && <p className="mt-2 text-xs text-text-secondary">{text.hint}</p>}

      <div className="mt-3 grid w-48 grid-cols-2 overflow-hidden rounded-control border border-border-calm bg-surface" aria-label={text.cartoon}>
        {([['cartoon', text.cartoon], ['photo', text.photo]] as const).map(([value, label]) => (
          <button
            aria-pressed={mode === value}
            className={`min-h-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${mode === value ? 'bg-primary-soft font-semibold text-primary' : 'text-text-secondary'}`}
            disabled={disabled}
            key={value}
            type="button"
            onClick={() => { onModeChange(value); onError('') }}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'cartoon' && (
        <div className="mt-4 w-full overflow-hidden rounded-card border border-border-calm bg-surface shadow-calm" aria-label={text.hint}>
          {rows.map((row, index) => {
            const optionIndex = row.options.indexOf(config[row.part] as never)
            return (
              <div className={`grid min-h-[58px] grid-cols-[72px_44px_minmax(0,1fr)_44px] items-center px-3 ${index ? 'border-t border-border' : ''}`} key={row.part}>
                <span className="text-sm font-medium">{row.label}</span>
                <button className="grid min-h-11 min-w-11 place-items-center rounded-control text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" disabled={disabled} type="button" aria-label={`${text.previous}${row.label}`} onClick={() => changePart(row.part, -1)}>
                  {isRtl ? <ChevronRight aria-hidden="true" size={22} /> : <ChevronLeft aria-hidden="true" size={22} />}
                </button>
                <span className="truncate px-1 text-center text-sm text-heading">{row.labels[optionIndex]}</span>
                <button className="grid min-h-11 min-w-11 place-items-center rounded-control text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" disabled={disabled} type="button" aria-label={`${text.next}${row.label}`} onClick={() => changePart(row.part, 1)}>
                  {isRtl ? <ChevronLeft aria-hidden="true" size={22} /> : <ChevronRight aria-hidden="true" size={22} />}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

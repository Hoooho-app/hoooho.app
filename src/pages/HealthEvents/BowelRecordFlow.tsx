import { ArrowLeft, Camera, Image as ImageIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HohoButton, HohoInput } from '../../components/design-system'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import type { JournalBowelDetails, JournalMetadata } from '../../types/journal'
import { useQuickRecordPhotos, type QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'

type SaveRecord = (content: string, occurredAt: string, channel: 'text', photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>
type Draft = JournalBowelDetails & { occurredAt: string }

export const bowelShapes = ['硬小颗粒', '细小颗粒', '成团偏硬', '光滑条状', '松散软块', '糊状', '水样', '无法判断'] as const
export const bowelColors = ['灰白', '黄色', '黄褐', '棕色', '深棕', '绿色', '近黑', '红色', '无法判断'] as const
export const bowelAmounts = ['很少', '较少', '一般', '较多', '很多'] as const
export const bowelDurations = ['1–2分钟', '2–5分钟', '5–10分钟', '超过10分钟'] as const
export const bowelProcesses = ['顺利', '有些费力', '明显费力', '像是还没排完'] as const
export const bowelObservations = ['黏液', '泡沫', '奶瓣或食物残渣', '腹胀', '肚子痛（孩子能表达时）', '排便时哭闹或明显不适', '没有特别发现'] as const

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

const emptyDraft = (): Draft => ({ occurredAt: localDateTimeValue(), shapes: [], observations: [] })
const draftKey = (memberId: string) => `hoooho-bowel-record-draft:${memberId}`

function readDraft(memberId: string): Draft {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(draftKey(memberId)) ?? '') as Draft
    return parsed && typeof parsed.occurredAt === 'string' && Array.isArray(parsed.shapes) && Array.isArray(parsed.observations) ? parsed : emptyDraft()
  } catch { return emptyDraft() }
}

function toggle(values: string[], value: string) { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value] }

function Choice({ label, options, value, onChange, optional = true }: { label: string; options: readonly string[]; value?: string; onChange: (value?: string) => void; optional?: boolean }) {
  return <fieldset className="bowel-fieldset"><legend>{label}{optional && <span>（可选）</span>}</legend><div className="bowel-choice-grid">{options.map((option) => <button aria-pressed={value === option} key={option} onClick={() => onChange(value === option ? undefined : option)} type="button">{option}</button>)}</div></fieldset>
}

function BowelPhotos({ model }: { model: ReturnType<typeof useQuickRecordPhotos> }) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  return <section className="bowel-photo-section"><div className="bowel-section-heading"><h2>添加图片 <span>（可选）</span></h2><em>{model.photos.length}/6</em></div>
    <div className="bowel-photo-actions"><button onClick={() => cameraRef.current?.click()} type="button"><Camera size={22} />拍照</button><button onClick={() => libraryRef.current?.click()} type="button"><ImageIcon size={22} />从相册选择</button></div>
    {model.photos.length > 0 && <div className="bowel-photo-grid">{model.photos.map((photo, index) => <div key={photo.localId}><img alt={`照片 ${index + 1}`} src={photo.previewUrl} /><button aria-label={`删除照片 ${index + 1}`} onClick={() => model.remove(photo.localId)} type="button">×</button>{photo.status === 'failed' ? <button aria-label={`重试上传 ${photo.name}`} onClick={() => model.retry(photo.localId)} type="button">重试</button> : <span>{photo.status === 'uploading' ? '上传中' : ''}</span>}</div>)}</div>}
    <input ref={cameraRef} accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(event) => { model.chooseFiles(event.target.files); event.currentTarget.value = '' }} type="file" />
    <input ref={libraryRef} accept="image/jpeg,image/png,image/webp" hidden multiple onChange={(event) => { model.chooseFiles(event.target.files); event.currentTarget.value = '' }} type="file" />
    <p>照片只用于记录所见，可以稍后补充</p>{model.notice && <p role="status">{model.notice}</p>}{model.blocked && <p role="alert">请重试或删除上传失败的照片后再保存</p>}
  </section>
}

export function bowelSummary(details: JournalBowelDetails) {
  const primary = [details.shapes.join('、'), details.color ? `${details.color}色` : '', details.amount].filter(Boolean).join(' · ')
  const secondary = [details.process, ...details.observations.filter((item) => item !== '没有特别发现')].filter(Boolean)
  return [primary || '排便', secondary.length ? secondary.join('、') : ''].filter(Boolean).join('\n')
}

export function BowelRecordFlow({ memberId, token, onBack, onClose, onConfirm, onSaved }: { memberId: string; token: string; onBack: () => void; onClose: () => void; onConfirm: SaveRecord; onSaved: (message: string) => void }) {
  const [draft, setDraft] = useState(() => readDraft(memberId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const layerRef = useRef<HTMLElement>(null)
  const photos = useQuickRecordPhotos(memberId, token, 6)
  usePageScrollLock(true)
  useDialogFocus(true, layerRef)
  useEffect(() => { sessionStorage.setItem(draftKey(memberId), JSON.stringify(draft)) }, [draft, memberId])
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const updateObservation = (option: string) => update('observations', option === '没有特别发现' ? (draft.observations.includes(option) ? [] : [option]) : toggle(draft.observations.filter((item) => item !== '没有特别发现'), option))
  const save = async () => {
    const timestamp = Date.parse(draft.occurredAt)
    if (!draft.occurredAt || !Number.isFinite(timestamp) || timestamp > Date.now()) { setError('记录时间不能晚于现在'); return }
    setSaving(true); setError('')
    try {
      const details: JournalBowelDetails = { shapes: draft.shapes, observations: draft.observations, ...(draft.color ? { color: draft.color } : {}), ...(draft.amount ? { amount: draft.amount } : {}), ...(draft.durationRange ? { durationRange: draft.durationRange } : {}), ...(draft.process ? { process: draft.process } : {}), ...(draft.bloodObservation ? { bloodObservation: draft.bloodObservation } : {}) }
      const message = await onConfirm(bowelSummary(details), new Date(timestamp).toISOString(), 'text', photos.payload(), { categories: ['elimination'], bowel: details })
      photos.clearAfterSave(); sessionStorage.removeItem(draftKey(memberId)); onSaved(message); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') } finally { setSaving(false) }
  }
  return <div className="diet-record-page-layer"><section aria-label="记录排便" aria-modal="true" className="diet-record-page bowel-record-page" ref={layerRef} role="dialog" tabIndex={-1}>
    <header><button aria-label="返回记录新情况" disabled={saving} onClick={onBack} type="button"><ArrowLeft size={22} /></button><h1>记录排便</h1><span aria-hidden="true" /></header>
    <div className="diet-record-scroll">
      <fieldset className="bowel-fieldset"><legend>形状 <span>（可多选）</span></legend><div className="bowel-shape-grid">{bowelShapes.map((shape, index) => <button aria-pressed={draft.shapes.includes(shape)} key={shape} onClick={() => update('shapes', toggle(draft.shapes, shape))} type="button"><i data-shape={index} aria-hidden="true"><b /><b /><b /></i><span>{shape}</span></button>)}</div></fieldset>
      <fieldset className="bowel-fieldset"><legend>颜色</legend><div className="bowel-color-grid">{bowelColors.map((color) => <button aria-pressed={draft.color === color} key={color} onClick={() => update('color', draft.color === color ? undefined : color)} type="button"><i data-color={color} /><span>{color}</span></button>)}</div>{draft.color && ['灰白', '近黑', '红色'].includes(draft.color) && <p className="bowel-gentle-hint">建议拍照留存；如有担心，可及时咨询医生</p>}</fieldset>
      <Choice label="分量" optional={false} options={bowelAmounts} value={draft.amount} onChange={(value) => update('amount', value)} />
      <Choice label="排便大约用了多久？" options={bowelDurations} value={draft.durationRange} onChange={(value) => update('durationRange', value)} />
      <Choice label="排便过程" options={bowelProcesses} value={draft.process} onChange={(value) => update('process', value)} />
      <Choice label="有没有看到血迹？" options={['未发现', '疑似看到']} value={draft.bloodObservation === 'none-seen' ? '未发现' : draft.bloodObservation === 'possibly-seen' ? '疑似看到' : undefined} onChange={(value) => update('bloodObservation', value === '未发现' ? 'none-seen' : value === '疑似看到' ? 'possibly-seen' : undefined)} />
      {draft.bloodObservation === 'possibly-seen' && <p className="bowel-gentle-hint">建议拍照留存，方便之后继续观察</p>}
      <fieldset className="bowel-fieldset"><legend>还观察到什么？<span>（可多选）</span></legend><div className="bowel-choice-grid">{bowelObservations.map((option) => <button aria-pressed={draft.observations.includes(option)} key={option} onClick={() => updateObservation(option)} type="button">{option}</button>)}</div></fieldset>
      <BowelPhotos model={photos} />
      <HohoInput label="记录时间" max={localDateTimeValue()} onChange={(event) => update('occurredAt', event.target.value)} type="datetime-local" value={draft.occurredAt} />
      {error && <p className="diet-save-error" role="alert">{error}</p>}
      <div className="diet-record-save"><HohoButton disabled={saving || photos.blocked} fullWidth loading={saving} onClick={save} size="large">保存记录</HohoButton></div>
    </div>
  </section></div>
}

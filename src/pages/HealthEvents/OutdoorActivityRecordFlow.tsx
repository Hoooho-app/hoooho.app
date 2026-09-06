import { ArrowLeft, Bike, Camera, CircleEllipsis, Flower2, ImagePlus, MapPin, PersonStanding, Smile, Trees, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HohoButton, HohoInput } from '../../components/design-system'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import type { JournalMetadata, JournalOutdoorActivityDetails } from '../../types/journal'
import { localDateTimeValue } from '../../utils/healthOccurredAt'
import type { QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { useQuickRecordPhotos } from '../HealthEventDetail/components/QuickRecordPhotos'
import { exactDurationMinutes, outdoorActivitySummary, toggleChoice, toggleExclusive } from './outdoorActivityLogic'

type SaveRecord = (content: string, occurredAt: string, channel: 'text', photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>
type Draft = JournalOutdoorActivityDetails & { occurredAt: string; exactHours: string; exactMinutes: string; exactOpen: boolean }

export const activityOptions = [
  ['stroller_outing', '推车外出', PersonStanding], ['walking', '散步', PersonStanding], ['free_play', '自由玩耍', Trees], ['running_jumping', '跑跳', PersonStanding],
  ['cycling_balance_bike', '骑行或滑步车', Bike], ['ball_play', '球类活动', Smile], ['climbing', '攀爬', PersonStanding], ['other', '其他', CircleEllipsis]
] as const
export const placeOptions = [['neighborhood', '小区周边'], ['park', '公园'], ['grassland', '草地'], ['playground', '游乐场'], ['school_kindergarten', '学校或幼儿园'], ['mall_indoor_venue', '商场或室内场馆'], ['other', '其他']] as const
export const contactOptions = [['plants_pollen', '草木或花粉'], ['animals', '动物'], ['sand_soil', '沙土'], ['dust', '灰尘'], ['cold_air', '冷空气'], ['smoke_odor', '烟雾或明显气味'], ['water', '水'], ['none_observed', '没有特别接触']] as const
export const observationOptions = [['cough', '咳嗽'], ['wheeze_breathing_discomfort', '喘息或呼吸不适'], ['runny_nose_sneeze', '流鼻涕或打喷嚏'], ['red_eyes_eye_rubbing', '眼睛发红或揉眼'], ['red_itchy_skin', '皮肤发红或瘙痒'], ['scratching', '抓挠'], ['fall_injury', '摔倒或受伤'], ['none_observed', '没有特别发现']] as const
const durationOptions = [['under_15', '不到15分钟'], ['15_30', '15–30分钟'], ['30_60', '30–60分钟'], ['over_60', '超过1小时']] as const
const stateOptions = [['good', '状态不错'], ['tired', '有些累'], ['very_tired', '明显疲惫'], ['stopped', '中途停下']] as const
const draftKey = (memberId: string) => `hoooho-outdoor-activity-draft:${memberId}`
const emptyDraft = (): Draft => ({ activities: [], places: [], contacts: [], observations: [], occurredAt: localDateTimeValue(), exactHours: '', exactMinutes: '', exactOpen: false })
function readDraft(memberId: string): Draft { try { return { ...emptyDraft(), ...JSON.parse(sessionStorage.getItem(draftKey(memberId)) ?? '') } } catch { return emptyDraft() } }

function ChoiceGrid<T extends string>({ label, optional = true, options, values, onToggle }: { label: string; optional?: boolean; options: readonly (readonly [T, string, ...(typeof PersonStanding)[]])[]; values: T[]; onToggle: (value: T) => void }) {
  return <fieldset className="outdoor-fieldset"><legend>{label}{optional && <span>（可选）</span>}</legend><div className="outdoor-choice-grid">{options.map(([value, text, Icon]) => <button aria-pressed={values.includes(value)} key={value} onClick={() => onToggle(value)} type="button">{Icon && <Icon aria-hidden="true" size={22} strokeWidth={1.7} />}<span>{text}</span></button>)}</div></fieldset>
}

function OutdoorPhotos({ model }: { model: ReturnType<typeof useQuickRecordPhotos> }) {
  const cameraRef = useRef<HTMLInputElement>(null); const galleryRef = useRef<HTMLInputElement>(null)
  return <section className="outdoor-photo-section"><div className="outdoor-heading"><h2>添加图片 <span>（可选）</span></h2><em>{model.photos.length}/6</em></div><div className="outdoor-photo-actions"><button onClick={() => cameraRef.current?.click()} type="button"><Camera size={22} />拍照</button><button onClick={() => galleryRef.current?.click()} type="button"><ImagePlus size={22} />从相册选择</button></div>
    <input ref={cameraRef} accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(event) => { model.chooseFiles(event.target.files); event.currentTarget.value = '' }} type="file" /><input ref={galleryRef} accept="image/jpeg,image/png,image/webp" hidden multiple onChange={(event) => { model.chooseFiles(event.target.files); event.currentTarget.value = '' }} type="file" />
    {model.photos.length > 0 && <div className="outdoor-photo-grid">{model.photos.map((photo, index) => <div key={photo.localId}><button aria-label={`查看照片 ${index + 1}`} onClick={() => model.setPreviewIndex(index)} type="button"><img alt="" src={photo.previewUrl} /></button><button aria-label={`删除照片 ${index + 1}`} onClick={() => model.remove(photo.localId)} type="button"><X size={13} /></button><span>{photo.status === 'uploading' ? '上传中' : photo.status === 'failed' ? '上传失败' : `${index + 1}/6`}</span></div>)}</div>}
    <p>可以记录活动环境或当时的身体表现</p>{model.notice && <p role="status">{model.notice}</p>}{model.blocked && <p className="diet-save-error" role="alert">请重试或删除上传失败的照片后再保存</p>}</section>
}

export function OutdoorActivityRecordFlow({ memberId, token, onBack, onClose, onConfirm, onSaved }: { memberId: string; token: string; onBack: () => void; onClose: () => void; onConfirm: SaveRecord; onSaved: (message: string) => void }) {
  const [draft, setDraft] = useState(() => readDraft(memberId)); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const layerRef = useRef<HTMLElement>(null); const photos = useQuickRecordPhotos(memberId, token, 6)
  usePageScrollLock(true); useDialogFocus(true, layerRef); useEffect(() => { sessionStorage.setItem(draftKey(memberId), JSON.stringify(draft)) }, [draft, memberId])
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const exactMinutes = exactDurationMinutes(draft.exactHours, draft.exactMinutes)
  const save = async () => { const timestamp = Date.parse(draft.occurredAt); if (!draft.occurredAt || !Number.isFinite(timestamp) || timestamp > Date.now()) { setError('记录时间不能晚于现在'); return } setSaving(true); setError(''); try { const details: JournalOutdoorActivityDetails = { activities: draft.activities, places: draft.places, contacts: draft.contacts, observations: draft.observations, ...(draft.activityOtherText?.trim() ? { activityOtherText: draft.activityOtherText.trim() } : {}), ...(draft.placeOtherText?.trim() ? { placeOtherText: draft.placeOtherText.trim() } : {}), ...(draft.durationRange ? { durationRange: draft.durationRange } : {}), ...(exactMinutes ? { durationMinutes: exactMinutes } : {}), ...(draft.activityState ? { activityState: draft.activityState } : {}) }; const message = await onConfirm(outdoorActivitySummary(details), new Date(timestamp).toISOString(), 'text', photos.payload(), { categories: ['activity'], outdoorActivity: details }); photos.clearAfterSave(); sessionStorage.removeItem(draftKey(memberId)); onSaved(message); onClose() } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') } finally { setSaving(false) } }
  return <div className="diet-record-page-layer"><section aria-label="记录户外活动" aria-modal="true" className="diet-record-page outdoor-record-page" ref={layerRef} role="dialog" tabIndex={-1}><header><button aria-label="返回记录新情况" disabled={saving} onClick={onBack} type="button"><ArrowLeft size={22} /></button><h1>记录户外活动</h1><span aria-hidden="true" /></header><div className="diet-record-scroll outdoor-record-scroll">
    <ChoiceGrid label="做了什么？（可多选）" optional={false} options={activityOptions} values={draft.activities} onToggle={(value) => update('activities', toggleChoice(draft.activities, value))} />{draft.activities.includes('other') && <HohoInput label="写下活动名称" maxLength={80} onChange={(event) => update('activityOtherText', event.target.value)} value={draft.activityOtherText ?? ''} />}
    <fieldset className="outdoor-fieldset"><legend>大约活动了多久？<span>（可选）</span></legend><div className="outdoor-duration-grid">{durationOptions.map(([value, label]) => <button aria-pressed={draft.durationRange === value} key={value} onClick={() => setDraft((current) => ({ ...current, durationRange: current.durationRange === value ? undefined : value, exactHours: '', exactMinutes: '', exactOpen: false }))} type="button">{label}</button>)}</div><button className="outdoor-exact-trigger" onClick={() => update('exactOpen', !draft.exactOpen)} type="button">填写具体时长</button>{draft.exactOpen && <div className="outdoor-exact-duration"><label><input aria-label="具体时长小时" inputMode="numeric" max="24" min="0" onChange={(event) => setDraft((current) => ({ ...current, exactHours: event.target.value, durationRange: undefined }))} type="number" value={draft.exactHours} />小时</label><label><input aria-label="具体时长分钟" inputMode="numeric" max="59" min="0" onChange={(event) => setDraft((current) => ({ ...current, exactMinutes: event.target.value, durationRange: undefined }))} type="number" value={draft.exactMinutes} />分钟</label></div>}</fieldset>
    <ChoiceGrid label="去了哪里？（可多选）" optional={false} options={placeOptions} values={draft.places} onToggle={(value) => update('places', toggleChoice(draft.places, value))} />{draft.places.includes('other') && <HohoInput label="写下地点名称" maxLength={80} onChange={(event) => update('placeOtherText', event.target.value)} value={draft.placeOtherText ?? ''} />}
    <ChoiceGrid label="接触了什么？（可多选）" optional={false} options={contactOptions} values={draft.contacts} onToggle={(value) => update('contacts', toggleExclusive(draft.contacts, value, 'none_observed'))} />
    <OutdoorPhotos model={photos} />
    <fieldset className="outdoor-fieldset"><legend>活动时的状态<span>（可选）</span></legend><div className="outdoor-state-grid">{stateOptions.map(([value, label]) => <button aria-pressed={draft.activityState === value} key={value} onClick={() => update('activityState', draft.activityState === value ? undefined : value)} type="button">{label}</button>)}</div></fieldset>
    <ChoiceGrid label="活动中或之后观察到什么？（可多选）" optional={false} options={observationOptions} values={draft.observations} onToggle={(value) => update('observations', toggleExclusive(draft.observations, value, 'none_observed'))} />
    <HohoInput label="记录时间" max={localDateTimeValue()} onChange={(event) => update('occurredAt', event.target.value)} type="datetime-local" value={draft.occurredAt} />{error && <p className="diet-save-error" role="alert">{error}</p>}<div className="diet-record-save"><HohoButton disabled={saving || photos.blocked} fullWidth loading={saving} onClick={save} size="large">保存记录</HohoButton></div>
  </div></section></div>
}

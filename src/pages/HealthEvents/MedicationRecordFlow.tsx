import { ArrowLeft, Bell, Camera, Check, ChevronDown, ChevronRight, Circle, ImagePlus, Minus, Pill, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import type { JournalMedicationDetails, JournalMedicationItem, JournalMetadata, MedicationReminder } from '../../types/journal'
import { localDateTimeValue } from '../../utils/healthOccurredAt'
import { QuickRecordPhotos, useQuickRecordPhotos, type QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { medicationSummary, medicationUnits, normalizeDose } from './medicationRecordLogic'

type SaveRecord = (content: string, occurredAt: string, channel: 'text', photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>
type DraftDrug = JournalMedicationItem & { photoLocalIds?: string[] }
type Draft = { medications: DraftDrug[]; activeId: string; occurredAt: string }
type Frequency = MedicationReminder['frequency']
type ReminderEditor = {
  frequency: Frequency
  daily: { times: string[]; durationDays: number; endDate: string }
  interval: { intervalHours: number; customHours: string; firstReminderAt: string; durationDays: number; endDate: string }
  weekly: { weekdays: number[]; times: string[]; durationWeeks: number; endDate: string }
  custom: { selectedDates: string[]; times: string[]; dateToAdd: string }
}

const frequencies = [['daily', '每天'], ['interval_hours', '每隔几小时'], ['weekly', '每周'], ['custom', '自定义']] as const
const units = medicationUnits.filter((unit) => ['mL', 'mg', '片', '粒', '袋', '滴', '揿'].includes(unit))
const defaultTimes = ['08:00', '14:00', '20:00', '22:00']
const dayLabels = ['日', '一', '二', '三', '四', '五', '六']
const isoDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const addHours = (value: string, hours: number) => { const date = new Date(value); date.setHours(date.getHours() + hours); return date }
const daysBetween = (start: string, end: string) => Math.max(1, Math.ceil((new Date(`${end}T23:59:59`).getTime() - new Date(start).getTime()) / 86_400_000))
const uniqueSortedTimes = (times: string[]) => [...new Set(times)].sort()
const complete = (item: DraftDrug) => Boolean(item.medicationName.trim() && item.amountValue > 0 && item.amountUnit)
const newReminder = (): MedicationReminder => ({ enabled: false, configured: false, frequency: 'daily', timesPerDay: 3, times: [...defaultTimes.slice(0, 3)], durationDays: 5 })
const newDrug = (): DraftDrug => ({ id: crypto.randomUUID(), medicationName: '', amountValue: 0, amountUnit: 'mL', dosageStep: 0.5, reminder: newReminder(), recognitionStatus: 'not_used' })
const blankDraft = (): Draft => { const item = newDrug(); return { medications: [item], activeId: item.id, occurredAt: localDateTimeValue() } }
const keyFor = (memberId: string) => `hoooho-medication-record-v2:${memberId}`

function normalizeReminder(value?: MedicationReminder): MedicationReminder {
  return { ...newReminder(), ...value, times: value?.times?.length ? value.times : [...defaultTimes.slice(0, 3)] }
}

function reminderEditor(value?: MedicationReminder): ReminderEditor {
  const reminder = normalizeReminder(value)
  const first = reminder.firstReminderAt ?? localDateTimeValue(addHours(localDateTimeValue(), 1))
  return {
    frequency: reminder.frequency,
    daily: { times: [...reminder.times], durationDays: reminder.endDate && reminder.frequency === 'daily' ? 0 : reminder.durationDays, endDate: reminder.frequency === 'daily' ? reminder.endDate ?? '' : '' },
    interval: { intervalHours: reminder.intervalHours ?? 6, customHours: '', firstReminderAt: first, durationDays: reminder.endDate && reminder.frequency === 'interval_hours' ? 0 : reminder.durationDays, endDate: reminder.frequency === 'interval_hours' ? reminder.endDate ?? '' : '' },
    weekly: { weekdays: reminder.weekdays?.length ? [...reminder.weekdays] : [new Date().getDay()], times: [...reminder.times], durationWeeks: reminder.endDate && reminder.frequency === 'weekly' ? 0 : reminder.durationWeeks ?? 4, endDate: reminder.frequency === 'weekly' ? reminder.endDate ?? '' : '' },
    custom: { selectedDates: reminder.selectedDates ? [...reminder.selectedDates] : [], times: [...reminder.times], dateToAdd: '' },
  }
}

function formatOccurredAt(value: string) {
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return '请选择时间'
  const now = new Date(); const clock = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return date.toDateString() === now.toDateString() ? `今天 ${clock}` : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${clock}`
}

function reminderSummary(reminder: MedicationReminder) {
  const times = reminder.times.join(' / ')
  if (reminder.frequency === 'interval_hours') return `每隔 ${reminder.intervalHours} 小时 · 首次 ${formatOccurredAt(reminder.firstReminderAt ?? '').replace('今天 ', '')} · 共 ${reminder.durationDays} 天`
  if (reminder.frequency === 'weekly') return `每周${(reminder.weekdays ?? []).map((day) => dayLabels[day]).join('、')} · ${times} · 共 ${reminder.durationWeeks} 周`
  if (reminder.frequency === 'custom') return (reminder.selectedDates?.length ?? 0) > 3 ? `已选 ${reminder.selectedDates!.length} 个日期 · ${times}` : `${(reminder.selectedDates ?? []).map((date) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`).join('、')} · ${times}`
  return `每天 ${reminder.timesPerDay} 次 · ${times} · 共 ${reminder.durationDays} 天`
}

export function MedicationRecordFlow({ memberId, token, initialMedication, initialOccurredAt, onBack, onClose, onConfirm, onSaved }: { memberId: string; token: string; initialMedication?: JournalMedicationDetails; initialOccurredAt?: string; onBack: () => void; onClose: () => void; onConfirm: SaveRecord; onSaved: (message: string) => void }) {
  const [draft, setDraft] = useState<Draft>(() => {
    if (initialMedication) {
      const medications = initialMedication.medications?.length ? initialMedication.medications : [{ id: crypto.randomUUID(), medicationName: initialMedication.medicationName, amountValue: initialMedication.amountValue ?? 0, amountUnit: initialMedication.amountUnit ?? 'mL', dosageStep: 0.5 as const, reminder: newReminder() }]
      return { medications, activeId: medications[0].id, occurredAt: initialOccurredAt ? localDateTimeValue(new Date(initialOccurredAt)) : localDateTimeValue() }
    }
    try { const saved = JSON.parse(sessionStorage.getItem(keyFor(memberId)) ?? 'null'); return saved?.medications?.length ? saved : blankDraft() } catch { return blankDraft() }
  })
  const [reminderOpen, setReminderOpen] = useState(false)
  const [reminderDraft, setReminderDraft] = useState<ReminderEditor>(() => reminderEditor())
  const [reminderError, setReminderError] = useState('')
  const [photoSourceOpen, setPhotoSourceOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const cameraRef = useRef<HTMLInputElement>(null); const albumRef = useRef<HTMLInputElement>(null)
  const photos = useQuickRecordPhotos(memberId, token, 6, 'medication-v2')
  const active = draft.medications.find((item) => item.id === draft.activeId) ?? draft.medications[0]
  const reminder = normalizeReminder(active.reminder)
  useEffect(() => { sessionStorage.setItem(keyFor(memberId), JSON.stringify(draft)) }, [draft, memberId])

  const updateActive = (changes: Partial<DraftDrug>) => { setDraft((current) => ({ ...current, medications: current.medications.map((item) => item.id === current.activeId ? { ...item, ...changes } : item) })); setError('') }
  const openReminder = () => { setReminderDraft(reminderEditor(active.reminder)); setReminderError(''); setReminderOpen(true) }
  const closeReminder = () => { setReminderOpen(false); setReminderError('') }
  const addDrug = () => { const item = newDrug(); setDraft((current) => ({ ...current, medications: [...current.medications, item], activeId: item.id })); closeReminder(); setError('') }
  const removeDrug = () => { if (draft.medications.length === 1 || !window.confirm('删除当前药品？已填写的内容将不会保存。')) return; setDraft((current) => { const medications = current.medications.filter((item) => item.id !== current.activeId); return { ...current, medications, activeId: medications[0].id } }); setError('') }
  const choosePackage = (source: 'camera' | 'album', files: FileList | null) => { const localIds = photos.chooseFiles(files); if (localIds.length) updateActive({ photoLocalIds: [...(active.photoLocalIds ?? []), ...localIds], recognitionSource: source, recognitionStatus: 'draft_unverified' }) }
  const changeTimes = (mode: 'daily' | 'weekly' | 'custom', delta: number) => setReminderDraft((current) => {
    const times = current[mode].times
    const count = Math.min(12, Math.max(1, times.length + delta))
    return { ...current, [mode]: { ...current[mode], times: Array.from({ length: count }, (_, index) => times[index] ?? defaultTimes[index] ?? `${String((8 + index * 2) % 24).padStart(2, '0')}:00`) } }
  })
  const setModeTime = (mode: 'daily' | 'weekly' | 'custom', index: number, value: string) => setReminderDraft((current) => ({ ...current, [mode]: { ...current[mode], times: current[mode].times.map((time, itemIndex) => itemIndex === index ? value : time) } }))

  const completeReminder = () => {
    const mode = reminderDraft.frequency
    const currentTimes = mode === 'daily' ? reminderDraft.daily.times : mode === 'weekly' ? reminderDraft.weekly.times : mode === 'custom' ? reminderDraft.custom.times : null
    if (currentTimes && (!currentTimes.length || currentTimes.some((time) => !time))) { setReminderError('请填写提醒时间'); return }
    if (currentTimes && uniqueSortedTimes(currentTimes).length !== currentTimes.length) { setReminderError('提醒时间不能重复'); return }
    if (mode === 'weekly' && !reminderDraft.weekly.weekdays.length) { setReminderError('请至少选择一天'); return }
    if (mode === 'custom' && !reminderDraft.custom.selectedDates.length) { setReminderError('请至少选择一个日期'); return }
    if (mode === 'interval_hours' && (!(reminderDraft.interval.intervalHours > 0) || !reminderDraft.interval.firstReminderAt)) { setReminderError('请设置有效的间隔和首次提醒'); return }
    const endDate = mode === 'daily' ? reminderDraft.daily.endDate : mode === 'interval_hours' ? reminderDraft.interval.endDate : mode === 'weekly' ? reminderDraft.weekly.endDate : ''
    const needsEndDate = mode === 'daily' ? reminderDraft.daily.durationDays === 0 : mode === 'interval_hours' ? reminderDraft.interval.durationDays === 0 : mode === 'weekly' && reminderDraft.weekly.durationWeeks === 0
    if (needsEndDate && !endDate) { setReminderError('请选择结束日期'); return }
    const start = mode === 'interval_hours' ? reminderDraft.interval.firstReminderAt : `${isoDate()}T00:00`
    if (endDate && new Date(`${endDate}T23:59:59`).getTime() < new Date(start).getTime()) { setReminderError('结束日期不能早于首次提醒日期'); return }
    if (mode === 'custom' && reminderDraft.custom.selectedDates.every((date) => new Date(`${date}T23:59:59`).getTime() < Date.now())) { setReminderError('请选择今天或未来日期'); return }
    let result: MedicationReminder
    if (mode === 'interval_hours') {
      const item = reminderDraft.interval; const durationDays = item.durationDays || daysBetween(item.firstReminderAt, item.endDate)
      result = { enabled: true, configured: true, frequency: mode, timesPerDay: 1, times: [item.firstReminderAt.slice(11, 16)], durationDays, intervalHours: item.intervalHours, firstReminderAt: item.firstReminderAt, ...(item.endDate ? { endDate: item.endDate } : {}) }
    } else if (mode === 'weekly') {
      const item = reminderDraft.weekly; const times = uniqueSortedTimes(item.times); const durationWeeks = item.durationWeeks || Math.max(1, Math.ceil(daysBetween(`${isoDate()}T00:00`, item.endDate) / 7))
      result = { enabled: true, configured: true, frequency: mode, timesPerDay: times.length, times, durationDays: durationWeeks * 7, durationWeeks, weekdays: [...item.weekdays].sort(), ...(item.endDate ? { endDate: item.endDate } : {}) }
    } else if (mode === 'custom') {
      const item = reminderDraft.custom; const times = uniqueSortedTimes(item.times); const dates = [...item.selectedDates].sort()
      result = { enabled: true, configured: true, frequency: mode, timesPerDay: times.length, times, durationDays: daysBetween(`${isoDate()}T00:00`, dates.at(-1)!), selectedDates: dates }
    } else {
      const item = reminderDraft.daily; const times = uniqueSortedTimes(item.times); const durationDays = item.durationDays || daysBetween(`${isoDate()}T00:00`, item.endDate)
      result = { enabled: true, configured: true, frequency: mode, timesPerDay: times.length, times, durationDays, ...(item.endDate ? { endDate: item.endDate } : {}) }
    }
    updateActive({ reminder: result }); closeReminder()
  }

  const save = async () => {
    const invalid = draft.medications.find((item) => !complete(item)); if (invalid) { setDraft((current) => ({ ...current, activeId: invalid.id })); setError(!invalid.medicationName.trim() ? '请选择或填写药品' : '请填写本次用量'); return }
    const timestamp = Date.parse(draft.occurredAt); if (!Number.isFinite(timestamp) || timestamp > Date.now()) { setError('记录时间不能晚于现在'); return }
    setSaving(true); setError('')
    try { const medications = draft.medications.map(({ photoLocalIds = [], ...item }) => ({ ...item, medicationName: item.medicationName.trim(), photoIds: photos.photos.filter((photo) => photoLocalIds.includes(photo.localId) && photo.serverId).map((photo) => photo.serverId!) })); const first = medications[0]; const details: JournalMedicationDetails = { medications, medicationName: first.medicationName, amountValue: first.amountValue, amountUnit: first.amountUnit, administrationRoute: 'oral' }; await onConfirm(medicationSummary(details), new Date(timestamp).toISOString(), 'text', photos.payload(), { categories: ['medication'], medication: details }); photos.clearAfterSave(); if (!initialMedication) sessionStorage.removeItem(keyFor(memberId)); onSaved('已记录'); onClose() } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') } finally { setSaving(false) }
  }

  const activePhoto = photos.photos.find((photo) => active.photoLocalIds?.includes(photo.localId))
  const renderStepper = (mode: 'daily' | 'weekly' | 'custom', label: string) => <><span>{label}</span><div className="medication-mini-stepper"><button aria-label="减少提醒次数" onClick={() => changeTimes(mode, -1)} type="button"><Minus /></button><strong>{reminderDraft[mode].times.length}</strong><button aria-label="增加提醒次数" onClick={() => changeTimes(mode, 1)} type="button"><Plus /></button></div></>
  const renderTimes = (mode: 'daily' | 'weekly' | 'custom') => <><span>提醒时间</span><div className="medication-time-inputs">{reminderDraft[mode].times.map((time, index) => <input aria-label={`第${index + 1}次提醒时间`} key={index} onChange={(event) => setModeTime(mode, index, event.target.value)} type="time" value={time} />)}</div></>
  const renderDayDuration = (mode: 'daily' | 'interval') => <><span>持续多久</span><div className="medication-sheet-options">{[1, 3, 5, 7].map((days) => <button aria-pressed={reminderDraft[mode].durationDays === days} key={days} onClick={() => setReminderDraft((current) => ({ ...current, [mode]: { ...current[mode], durationDays: days, endDate: '' } }))} type="button">{days}天</button>)}<button aria-pressed={reminderDraft[mode].durationDays === 0} onClick={() => setReminderDraft((current) => ({ ...current, [mode]: { ...current[mode], durationDays: 0 } }))} type="button">自定义</button></div>{reminderDraft[mode].durationDays === 0 && <input aria-label="结束日期" min={isoDate()} onChange={(event) => setReminderDraft((current) => ({ ...current, [mode]: { ...current[mode], endDate: event.target.value } }))} type="date" value={reminderDraft[mode].endDate} />}</>

  return <div className="medication-record-page-layer"><section aria-label="记录用药" aria-modal="true" className="medication-record-page medication-record-compact" role="dialog">
    <header><button aria-label="返回记录新情况" disabled={saving} onClick={onBack} type="button"><ArrowLeft /></button><h1>记录用药</h1><button aria-label="关闭" disabled={saving} onClick={onClose} type="button"><X /></button></header>
    <div className="medication-tab-bar"><div className="medication-tabs" role="tablist" aria-label="药品列表">{draft.medications.map((item, index) => <button aria-selected={item.id === active.id} key={item.id} onClick={() => { setDraft((current) => ({ ...current, activeId: item.id })); closeReminder(); setError('') }} role="tab" type="button"><span>{item.medicationName.trim().slice(0, 6) || `药品 ${index + 1}`}</span>{complete(item) ? <Check aria-label="已填写完整" /> : <Circle aria-label="待填写" />}</button>)}</div><button aria-label="添加另一种药" className="medication-tab-add" onClick={addDrug} type="button"><Plus /></button></div>
    <div className="medication-record-scroll">
      <section className="medication-compact-section"><h2>药品名称</h2><div className="medication-picker"><span className="medication-package-thumb">{activePhoto ? <img alt="药品图片" src={activePhoto.previewUrl} /> : <Pill />}</span><input aria-label="药品名称" onChange={(event) => updateActive({ medicationName: event.target.value, recognitionStatus: active.recognitionSource ? 'user_edited' : 'not_used' })} placeholder="搜索或选择药品" value={active.medicationName} /><button aria-label="添加药品图片" onClick={() => setPhotoSourceOpen(true)} type="button"><Camera /></button></div><input ref={cameraRef} accept="image/*" capture="environment" hidden onChange={(event) => { choosePackage('camera', event.target.files); event.currentTarget.value = '' }} type="file" /><input ref={albumRef} accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { choosePackage('album', event.target.files); event.currentTarget.value = '' }} type="file" />{active.recognitionSource && <small className="medication-recognition-note">图片已上传，识别结果需核对</small>}{photos.photos.length > 0 && <QuickRecordPhotos limit={6} model={photos} />}</section>
      <section className="medication-compact-section"><h2>剂量</h2><div className="medication-amount-row"><button aria-label="减少用量" onClick={() => updateActive({ amountValue: normalizeDose(active.amountValue - active.dosageStep, active.dosageStep) })} type="button"><Minus /></button><input aria-label="本次用量" inputMode="decimal" min="0" onChange={(event) => updateActive({ amountValue: Math.max(0, Number(event.target.value)) })} step="any" type="number" value={active.amountValue || ''} /><button aria-label="增加用量" onClick={() => updateActive({ amountValue: normalizeDose(active.amountValue + active.dosageStep, active.dosageStep) })} type="button"><Plus /></button><span className="medication-unit-select"><select aria-label="用量单位" onChange={(event) => updateActive({ amountUnit: event.target.value, dosageStep: ['片', '粒', '袋', '揿'].includes(event.target.value) ? 1 : 0.5 })} value={active.amountUnit}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select><ChevronDown aria-hidden="true" /></span></div></section>
      <label className="medication-time-row-main"><strong>记录时间（默认是现在）</strong><span>{formatOccurredAt(draft.occurredAt)}</span><ChevronRight /><input aria-label="记录时间" max={localDateTimeValue()} onChange={(event) => setDraft((current) => ({ ...current, occurredAt: event.target.value }))} type="datetime-local" value={draft.occurredAt} /></label>
      <section className="medication-reminder-main"><label><Bell /><strong>设置用药提醒</strong><input checked={reminder.enabled} onChange={(event) => { if (!event.target.checked) updateActive({ reminder: { ...reminder, enabled: false } }); else if (reminder.configured || active.reminder?.enabled) updateActive({ reminder: { ...reminder, enabled: true, configured: true } }); else openReminder() }} role="switch" type="checkbox" /></label>{reminder.enabled && <button className="medication-reminder-summary" onClick={openReminder} type="button"><span>{reminderSummary(reminder)}</span><em>编辑</em></button>}</section>
      {draft.medications.length > 1 && <button className="medication-remove-current" onClick={removeDrug} type="button">删除当前药品</button>}
      {error && <p className="medication-save-error" role="alert">{error}</p>}
    </div>
    <footer className="medication-fixed-save"><HohoButton disabled={saving || photos.blocked} fullWidth loading={saving} onClick={() => void save()} size="large">保存记录</HohoButton></footer>
    <BottomSheetSurface label="选择药品图片来源" onClose={() => setPhotoSourceOpen(false)} open={photoSourceOpen} title="添加药品图片"><div className="medication-photo-source"><button onClick={() => { setPhotoSourceOpen(false); cameraRef.current?.click() }} type="button"><Camera /><span><strong>拍照</strong><small>拍摄药盒或药品标签</small></span></button><button onClick={() => { setPhotoSourceOpen(false); albumRef.current?.click() }} type="button"><ImagePlus /><span><strong>从相册选择</strong><small>选择已有药品图片</small></span></button></div></BottomSheetSurface>
    <BottomSheetSurface className="medication-reminder-sheet-surface" footer={<HohoButton fullWidth onClick={completeReminder}>完成设置</HohoButton>} label="设置用药提醒" onClose={closeReminder} open={reminderOpen} title="设置用药提醒">
      <div className="medication-reminder-sheet">
        <span>提醒周期</span>
        <div className="medication-sheet-options">{frequencies.map(([value, label]) => <button aria-pressed={reminderDraft.frequency === value} key={value} onClick={() => { setReminderDraft((current) => ({ ...current, frequency: value })); setReminderError('') }} type="button">{label}</button>)}</div>
        {reminderDraft.frequency === 'daily' && <div className="medication-mode-fields">{renderStepper('daily', '每天提醒几次')}{renderTimes('daily')}{renderDayDuration('daily')}</div>}
        {reminderDraft.frequency === 'interval_hours' && <div className="medication-mode-fields">
          <span>间隔多久</span><div className="medication-sheet-options">{[2, 4, 6, 8, 12].map((hours) => <button aria-pressed={reminderDraft.interval.intervalHours === hours && !reminderDraft.interval.customHours} key={hours} onClick={() => setReminderDraft((current) => ({ ...current, interval: { ...current.interval, intervalHours: hours, customHours: '' } }))} type="button">{hours}小时</button>)}<button aria-pressed={Boolean(reminderDraft.interval.customHours)} onClick={() => setReminderDraft((current) => ({ ...current, interval: { ...current.interval, customHours: String(current.interval.intervalHours) } }))} type="button">自定义</button></div>
          {reminderDraft.interval.customHours && <input aria-label="自定义间隔小时" inputMode="numeric" min="1" onChange={(event) => setReminderDraft((current) => ({ ...current, interval: { ...current.interval, customHours: event.target.value, intervalHours: Number(event.target.value) } }))} type="number" value={reminderDraft.interval.customHours} />}
          <span>首次提醒</span><input aria-label="首次提醒" min={localDateTimeValue()} onChange={(event) => setReminderDraft((current) => ({ ...current, interval: { ...current.interval, firstReminderAt: event.target.value } }))} type="datetime-local" value={reminderDraft.interval.firstReminderAt} />
          <small className="medication-reminder-preview">下一次预计在{formatOccurredAt(localDateTimeValue(addHours(reminderDraft.interval.firstReminderAt, reminderDraft.interval.intervalHours)))}</small>
          {renderDayDuration('interval')}
        </div>}
        {reminderDraft.frequency === 'weekly' && <div className="medication-mode-fields">
          <span>每周哪几天</span><div className="medication-weekdays">{[1, 2, 3, 4, 5, 6, 0].map((day) => <button aria-pressed={reminderDraft.weekly.weekdays.includes(day)} key={day} onClick={() => { setReminderDraft((current) => ({ ...current, weekly: { ...current.weekly, weekdays: current.weekly.weekdays.includes(day) ? current.weekly.weekdays.filter((item) => item !== day) : [...current.weekly.weekdays, day] } })); setReminderError('') }} type="button">{dayLabels[day]}</button>)}</div>
          {reminderError === '请至少选择一天' && <small className="medication-reminder-error">{reminderError}</small>}
          {renderStepper('weekly', '当天提醒几次')}{renderTimes('weekly')}
          <span>持续多久</span><div className="medication-sheet-options">{[1, 2, 4].map((weeks) => <button aria-pressed={reminderDraft.weekly.durationWeeks === weeks} key={weeks} onClick={() => setReminderDraft((current) => ({ ...current, weekly: { ...current.weekly, durationWeeks: weeks, endDate: '' } }))} type="button">{weeks}周</button>)}<button aria-pressed={reminderDraft.weekly.durationWeeks === 0} onClick={() => setReminderDraft((current) => ({ ...current, weekly: { ...current.weekly, durationWeeks: 0 } }))} type="button">自定义</button></div>
          {reminderDraft.weekly.durationWeeks === 0 && <input aria-label="结束日期" min={isoDate()} onChange={(event) => setReminderDraft((current) => ({ ...current, weekly: { ...current.weekly, endDate: event.target.value } }))} type="date" value={reminderDraft.weekly.endDate} />}
        </div>}
        {reminderDraft.frequency === 'custom' && <div className="medication-mode-fields">
          <span>选择日期</span><div className="medication-date-add"><input aria-label="添加提醒日期" min={isoDate()} onChange={(event) => setReminderDraft((current) => ({ ...current, custom: { ...current.custom, dateToAdd: event.target.value } }))} type="date" value={reminderDraft.custom.dateToAdd} /><button disabled={!reminderDraft.custom.dateToAdd} onClick={() => { setReminderDraft((current) => ({ ...current, custom: { ...current.custom, selectedDates: [...new Set([...current.custom.selectedDates, current.custom.dateToAdd])].sort(), dateToAdd: '' } })); setReminderError('') }} type="button">继续添加日期</button></div>
          <div className="medication-selected-dates">{reminderDraft.custom.selectedDates.map((date) => <button aria-label={`移除${date}`} key={date} onClick={() => setReminderDraft((current) => ({ ...current, custom: { ...current.custom, selectedDates: current.custom.selectedDates.filter((item) => item !== date) } }))} type="button">{`${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`}<X /></button>)}</div>
          {reminderError === '请至少选择一个日期' && <small className="medication-reminder-error">{reminderError}</small>}
          {renderStepper('custom', '当天提醒几次')}{renderTimes('custom')}
        </div>}
        {reminderError && !['请至少选择一天', '请至少选择一个日期'].includes(reminderError) && <small className="medication-reminder-error">{reminderError}</small>}
      </div>
    </BottomSheetSurface>
  </section></div>
}

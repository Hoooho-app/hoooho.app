import { ArrowLeft, Camera, ChevronDown, Minus, Pill, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HohoButton } from '../../components/design-system'
import type { JournalMedicationDetails, JournalMedicationItem } from '../../types/journal'
import { localDateTimeToIso, localDateTimeValue } from '../../utils/healthOccurredAt'
import { QuickRecordPhotos, useQuickRecordPhotos } from '../HealthEventDetail/components/QuickRecordPhotos'
import { medicationSummary, medicationUnits, normalizeDose } from './medicationRecordLogic'
import { RecordRelationSection, type RecordBackfillTarget } from './RecordRelationSection'
import type { LinkedBackfillResult, SaveJournalRecord } from './recordFlowTypes'

type DraftDrug = JournalMedicationItem & { photoLocalIds?: string[] }
type Draft = { medications: DraftDrug[]; activeId: string; occurredAt: string; linkedSymptomRecordIds: string[]; linkedVisitRecordIds: string[] }

const units = medicationUnits.filter((unit) => ['mL', 'mg', 'g', '片', '粒', '袋', '滴', '揿'].includes(unit))
const newDrug = (): DraftDrug => ({ id: crypto.randomUUID(), medicationName: '', amountValue: 0, amountUnit: 'mL', dosageStep: 0.5, recognitionStatus: 'not_used' })
const blankDraft = (): Draft => { const item = newDrug(); return { medications: [item], activeId: item.id, occurredAt: localDateTimeValue(), linkedSymptomRecordIds: [], linkedVisitRecordIds: [] } }
const keyFor = (memberId: string) => `hoooho-medication-record-v3:${memberId}`
const isComplete = (item: DraftDrug) => Boolean(item.medicationName.trim() && item.amountValue > 0 && item.amountUnit)

function restore(memberId: string, initialMedication?: JournalMedicationDetails, initialOccurredAt?: string): Draft {
  if (initialMedication) {
    const medications = initialMedication.medications?.length ? initialMedication.medications : [{ id: crypto.randomUUID(), medicationName: initialMedication.medicationName, amountValue: initialMedication.amountValue ?? 0, amountUnit: initialMedication.amountUnit ?? 'mL', dosageStep: 0.5 }]
    return { medications, activeId: medications[0].id, occurredAt: initialOccurredAt ? localDateTimeValue(new Date(initialOccurredAt)) : localDateTimeValue(), linkedSymptomRecordIds: initialMedication.linkedSymptomRecordIds ?? [], linkedVisitRecordIds: initialMedication.linkedVisitRecordIds ?? [] }
  }
  try { const saved = JSON.parse(sessionStorage.getItem(keyFor(memberId)) ?? 'null') as Draft | null; return saved?.medications?.length ? saved : blankDraft() } catch { return blankDraft() }
}

export function MedicationRecordFlow({ memberId, token, initialMedication, initialOccurredAt, linkedBackfill, onBackfill, onBack, onClose, onConfirm, onSaved }: {
  memberId: string; token: string; initialMedication?: JournalMedicationDetails; initialOccurredAt?: string; linkedBackfill?: LinkedBackfillResult
  onBackfill: (target: RecordBackfillTarget) => void; onBack: () => void; onClose: () => void; onConfirm: SaveJournalRecord; onSaved: (message: string) => void
}) {
  const [draft, setDraft] = useState(() => restore(memberId, initialMedication, initialOccurredAt))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const photos = useQuickRecordPhotos(memberId, token, 6, 'medication-v3')
  const active = draft.medications.find((item) => item.id === draft.activeId) ?? draft.medications[0]
  useEffect(() => { sessionStorage.setItem(keyFor(memberId), JSON.stringify(draft)) }, [draft, memberId])
  useEffect(() => {
    if (!linkedBackfill) return
    if (linkedBackfill.relation === 'symptom') setDraft((current) => current.linkedSymptomRecordIds.includes(linkedBackfill.recordId) ? current : { ...current, linkedSymptomRecordIds: [...current.linkedSymptomRecordIds, linkedBackfill.recordId] })
    if (linkedBackfill.relation === 'visit') setDraft((current) => current.linkedVisitRecordIds.includes(linkedBackfill.recordId) ? current : { ...current, linkedVisitRecordIds: [...current.linkedVisitRecordIds, linkedBackfill.recordId] })
  }, [linkedBackfill])
  const updateActive = (changes: Partial<DraftDrug>) => { setDraft((current) => ({ ...current, medications: current.medications.map((item) => item.id === current.activeId ? { ...item, ...changes } : item) })); setError('') }
  const addDrug = () => { const item = newDrug(); setDraft((current) => ({ ...current, medications: [...current.medications, item], activeId: item.id })) }
  const removeDrug = () => { if (draft.medications.length === 1) return; setDraft((current) => { const medications = current.medications.filter((item) => item.id !== current.activeId); return { ...current, medications, activeId: medications[0].id } }) }
  const save = async () => {
    if (saving) return
    const invalid = draft.medications.find((item) => !isComplete(item))
    if (invalid) { setDraft((current) => ({ ...current, activeId: invalid.id })); setError(!invalid.medicationName.trim() ? '请填写药品名称' : '请填写本次实际用量'); return }
    const timestamp = Date.parse(draft.occurredAt)
    if (!Number.isFinite(timestamp) || timestamp > Date.now()) { setError('实际用药时间不能晚于现在'); return }
    setSaving(true); setError('')
    try {
      const medications = draft.medications.map(({ photoLocalIds: _photoLocalIds, reminder: _legacyReminder, ...item }) => ({ ...item, medicationName: item.medicationName.trim() }))
      const first = medications[0]
      const details: JournalMedicationDetails = { medications, medicationName: first.medicationName, amountValue: first.amountValue, amountUnit: first.amountUnit, administrationRoute: 'oral', linkedSymptomRecordIds: draft.linkedSymptomRecordIds, linkedVisitRecordIds: draft.linkedVisitRecordIds }
      const result = await onConfirm(medicationSummary(details), localDateTimeToIso(draft.occurredAt), 'text', photos.payload(), { categories: ['medication'], medication: details, occurredAt: localDateTimeToIso(draft.occurredAt), timePrecision: 'exact' })
      photos.clearAfterSave(); if (!initialMedication) sessionStorage.removeItem(keyFor(memberId)); onSaved(result.message); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') } finally { setSaving(false) }
  }
  return <div className="medication-record-page-layer"><section aria-label="记录用药" aria-modal="true" className="medication-record-page medication-record-compact" role="dialog">
    <header><button aria-label="返回" disabled={saving} onClick={onBack} type="button"><ArrowLeft /></button><h1>记录用药</h1><button aria-label="关闭" disabled={saving} onClick={onClose} type="button"><X /></button></header>
    <div className="medication-tab-bar"><div className="medication-tabs" role="tablist" aria-label="药品列表">{draft.medications.map((item, index) => <button aria-selected={item.id === active.id} key={item.id} onClick={() => setDraft((current) => ({ ...current, activeId: item.id }))} role="tab" type="button"><span>{item.medicationName.trim().slice(0, 7) || `药品 ${index + 1}`}</span></button>)}</div><button aria-label="添加另一种药" className="medication-tab-add" onClick={addDrug} type="button"><Plus /></button></div>
    <div className="medication-record-scroll">
      <section className="medication-compact-section"><h2>药品名称</h2><div className="medication-picker"><span className="medication-package-thumb"><Pill /></span><input aria-label="药品名称" onChange={(event) => updateActive({ medicationName: event.target.value })} placeholder="搜索或填写药品名称" value={active.medicationName} /><button aria-label="添加药品照片" onClick={() => document.getElementById(`medication-photo-${active.id}`)?.click()} type="button"><Camera /></button></div><input id={`medication-photo-${active.id}`} accept="image/jpeg,image/png,image/webp" hidden multiple onChange={(event) => { photos.chooseFiles(event.target.files); event.currentTarget.value = '' }} type="file" />{photos.photos.length > 0 && <QuickRecordPhotos limit={6} model={photos} />}</section>
      <section className="medication-compact-section"><h2>本次实际用量</h2><div className="medication-amount-row"><button aria-label="减少用量" onClick={() => updateActive({ amountValue: normalizeDose(active.amountValue - active.dosageStep, active.dosageStep) })} type="button"><Minus /></button><input aria-label="实际用量" inputMode="decimal" min="0" onChange={(event) => updateActive({ amountValue: Math.max(0, Number(event.target.value)) })} step="any" type="number" value={active.amountValue || ''} /><button aria-label="增加用量" onClick={() => updateActive({ amountValue: normalizeDose(active.amountValue + active.dosageStep, active.dosageStep) })} type="button"><Plus /></button><span className="medication-unit-select"><select aria-label="用量单位" onChange={(event) => updateActive({ amountUnit: event.target.value, dosageStep: ['片', '粒', '袋', '揿'].includes(event.target.value) ? 1 : 0.5 })} value={active.amountUnit}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select><ChevronDown /></span></div></section>
      <label className="symptom-time-row"><span>实际用药时间</span><input aria-label="实际用药时间" max={localDateTimeValue()} onChange={(event) => setDraft((current) => ({ ...current, occurredAt: event.target.value }))} type="datetime-local" value={draft.occurredAt} /></label>
      <RecordRelationSection title="补充对应症状" hint="选择这次用药对应的症状" memberId={memberId} token={token} occurredAt={draft.occurredAt} categories={['symptom']} selectedIds={draft.linkedSymptomRecordIds} onChange={(ids) => setDraft((current) => ({ ...current, linkedSymptomRecordIds: ids }))} onBackfill={onBackfill} target="symptom" />
      <RecordRelationSection title="补充对应就医" hint="选择开具或建议本次用药的就医资料" memberId={memberId} token={token} occurredAt={draft.occurredAt} categories={['visit']} selectedIds={draft.linkedVisitRecordIds} onChange={(ids) => setDraft((current) => ({ ...current, linkedVisitRecordIds: ids }))} onBackfill={onBackfill} target="visit" />
      {draft.medications.length > 1 && <button className="medication-remove-drug" onClick={removeDrug} type="button">删除当前药品</button>}
      {error && <p className="medication-save-error" role="alert">{error}</p>}<div className="medication-record-save"><HohoButton disabled={saving || photos.blocked} fullWidth loading={saving} onClick={() => void save()} size="large">保存记录</HohoButton></div>
    </div>
  </section></div>
}

import { useState } from 'react'
import { HohoButton } from '../../components/design-system'
import type { VisitClinicalItem, VisitClinicalPatch, VisitClinicalSection } from '../../types/visitSheet'
import { clinicalAnswer } from './clinicalPresentation'
import { reportTime } from './ReportChapter'

type PendingChoice = { patch: VisitClinicalPatch; label: string }

export function ClinicalChoices({ section, rows, scopeKey, busy, timezone, onSave, onEvidence }: {
  section: VisitClinicalSection
  rows: VisitClinicalItem[]
  scopeKey: string | null
  busy: boolean
  timezone: string
  onSave: (patch: VisitClinicalPatch) => Promise<boolean>
  onEvidence: (ids: string[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [pending, setPending] = useState<PendingChoice | null>(null)
  const [saving, setSaving] = useState(false)
  const newLabel = label.trim()
  const duplicate = rows.some(row => row.label === newLabel)
  const disabled = !scopeKey || busy || saving || !!pending
  const addLabel = section === 'history' ? '添加症状' : '添加体格项目'
  async function save(choice: PendingChoice) {
    setSaving(true)
    setPending(choice)
    if (await onSave(choice.patch)) {
      setPending(null)
      if (choice.patch.label) {
        setAdding(false)
        setLabel('')
      }
    }
    setSaving(false)
  }

  return <div className="visit-clinical-choices">
    <p className="visit-clinical-hint">{scopeKey ? '点选后保存到本次情况单。未填写的项目留空。' : '选择主诉后可补充。'}</p>
    <ul className="visit-clinical-list">
      {rows.map(row => <li key={row.id}>
        <div>
          <span>{row.label}</span>
          {row.manual && row.value !== null && <small>家长补充</small>}
          {!!row.sourceIds.length && <button type="button" className="visit-clinical-source" onClick={() => onEvidence(row.sourceIds)}>{row.value === null ? '记录不一致' : row.at ? reportTime(row.at, timezone) : '已有记录'}</button>}
        </div>
        <div className="visit-clinical-buttons" role="group" aria-label={row.label}>
          {[true, false].map(value => <button key={String(value)} type="button" aria-pressed={row.value === value} disabled={disabled} onClick={() => {
            if (scopeKey && row.value !== value) void save({ label: row.label, patch: { scopeKey, section, id: row.id, value } })
          }}>{clinicalAnswer(section, value)}</button>)}
          <button type="button" className="visit-clinical-clear" aria-label={`清空${row.label}`} disabled={disabled} hidden={row.value === null} onClick={() => {
            if (scopeKey) void save({ label: row.label, patch: { scopeKey, section, id: row.id, value: null } })
          }}>清空</button>
        </div>
      </li>)}
    </ul>
    {pending && <div className="visit-clinical-pending" role={saving ? 'status' : 'alert'}>
      {saving ? `正在保存${pending.label}…` : <>
        <p>{pending.label}的选择尚未保存。{pending.patch.value === null ? '待清空。' : `已选${clinicalAnswer(section, pending.patch.value)}。`}</p>
        <HohoButton size="small" variant="secondary" disabled={busy} onClick={() => void save(pending)}>重试保存</HohoButton>
        <HohoButton size="small" variant="text" onClick={() => setPending(null)}>放弃此次修改</HohoButton>
      </>}
    </div>}
    {adding ? <div className="visit-clinical-add">
      <label className="hoho-field"><span>{section === 'history' ? '症状名称' : '体格项目名称'}</span><input className="hoho-input" maxLength={60} value={label} disabled={disabled} onChange={event => setLabel(event.target.value)} /></label>
      {duplicate && <p className="visit-clinical-hint">已有这个项目，可以直接点选。</p>}
      <div className="visit-clinical-buttons">
        {[true, false].map(value => <button key={String(value)} type="button" disabled={disabled || !newLabel || duplicate} onClick={() => {
          if (scopeKey) void save({ label: newLabel, patch: { scopeKey, section, id: `custom:${crypto.randomUUID()}`, label: newLabel, value } })
        }}>{clinicalAnswer(section, value)}</button>)}
        <HohoButton size="small" variant="text" disabled={saving || !!pending} onClick={() => { setAdding(false); setLabel('') }}>取消</HohoButton>
      </div>
    </div> : <HohoButton size="small" variant="text" disabled={disabled} onClick={() => setAdding(true)}>{addLabel}</HohoButton>}
  </div>
}

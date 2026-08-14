import { ChangeEvent, FormEvent, useRef, useState } from 'react'
import { Camera, Check, ChevronDown, Plus } from 'lucide-react'
import { WebPageHeader } from '../../components/common'
import { HealthProfileActionBar, MemberIdentityCard } from '../../components/health'
import { HohoButton, Typography } from '../../components/design-system'
import {
  emptyMedicationRecord,
  medicationDateSummary,
  medicationDetailSummary,
  nextMedicationSequence,
  normalizeMedicationRecords,
  type MedicationProfileRecord
} from '../../features/health-profile/utils/medicationProfile'
import type { Member } from '../../types'

const routes = ['口服', '外用', '吸入', '注射', '滴眼', '其他']

function loadMedicationRecords(storageKey: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(parsed) ? normalizeMedicationRecords(parsed) : []
  } catch { return [] }
}

function MedicationNumber({ sequence }: { sequence: number }) {
  return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-surface">{sequence}</span>
}

function MedicationFields({ record, onChange, onImage }: {
  record: MedicationProfileRecord
  onChange: (changes: Partial<MedicationProfileRecord>) => void
  onImage: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  return <div className="grid gap-4">
    <button className="grid min-h-28 place-items-center rounded-control border border-dashed bg-background px-4 text-center" onClick={() => fileInput.current?.click()} type="button">
      <span className="grid gap-1"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-primary-soft text-primary"><Camera size={22} /></span><strong className="text-sm">拍摄 / 上传药盒或处方</strong><span className="text-xs leading-5 text-text-secondary">{record.imageName || '图片将关联到当前药物；智能识别暂未开放'}</span></span>
    </button>
    <input ref={fileInput} accept="image/*" capture="environment" className="sr-only" type="file" onChange={onImage} />
    <label className="hoho-field"><span className="hoho-text-label">药物名称</span><input className="hoho-input" value={record.name} onChange={(event) => onChange({ name: event.target.value })} /></label>
    <label className="hoho-field"><span className="hoho-text-label">使用原因 / 对症</span><input className="hoho-input" value={record.reason} onChange={(event) => onChange({ reason: event.target.value })} /></label>
    <div className="grid grid-cols-2 gap-3">
      <label className="hoho-field min-w-0"><span className="hoho-text-label">每次用量</span><input className="hoho-input" value={record.dose} onChange={(event) => onChange({ dose: event.target.value })} /></label>
      <label className="hoho-field min-w-0"><span className="hoho-text-label">使用频率</span><input className="hoho-input" value={record.frequency} onChange={(event) => onChange({ frequency: event.target.value })} /></label>
    </div>
    <label className="hoho-field"><span className="hoho-text-label">用药方式</span><select className="hoho-select" value={record.route} onChange={(event) => onChange({ route: event.target.value })}><option value="">请选择</option>{routes.map((route) => <option key={route}>{route}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-3">
      <label className="hoho-field min-w-0"><span className="hoho-text-label">开始日期</span><input className="hoho-input px-2" type="date" value={record.startedAt} onChange={(event) => onChange({ startedAt: event.target.value })} /></label>
      <label className="hoho-field min-w-0"><span className="hoho-text-label">结束日期</span><input aria-label="结束日期，留空表示至今" className="hoho-input px-2" type="date" value={record.endedAt} onChange={(event) => onChange({ endedAt: event.target.value })} /></label>
    </div>
    <Typography variant="caption">结束日期留空表示至今</Typography>
  </div>
}

export function MedicationProfilePage({ member, storageKey }: { member: Member; storageKey: string }) {
  const initial = useState(() => loadMedicationRecords(storageKey))[0]
  const [records, setRecords] = useState<MedicationProfileRecord[]>(() => initial.length ? initial : [emptyMedicationRecord(1)])
  const [expandedId, setExpandedId] = useState(() => initial[0]?.id ?? records[0].id)
  const [status, setStatus] = useState('')

  const updateRecord = (id: string, changes: Partial<MedicationProfileRecord>) => setRecords((current) => current.map((record) => record.id === id ? { ...record, ...changes } : record))
  const toggleRecord = (id: string) => setExpandedId((current) => current === id ? '' : id)
  const addRecord = () => {
    const next = emptyMedicationRecord(nextMedicationSequence(records))
    setRecords((current) => [...current, next]); setExpandedId(next.id); setStatus('')
  }
  const deleteRecord = (id: string) => {
    if (!window.confirm('确认删除这一种药物吗？')) return
    setRecords((current) => {
      const next = current.filter((record) => record.id !== id)
      if (!next.length) { const empty = emptyMedicationRecord(1); setExpandedId(empty.id); return [empty] }
      if (expandedId === id) setExpandedId(next[0].id)
      return next
    })
  }
  const attachImage = (id: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 1_500_000) { setStatus('图片过大，请选择 1.5MB 以内的图片'); return }
    const reader = new FileReader()
    reader.onload = () => updateRecord(id, { imageName: file.name, imageDataUrl: String(reader.result ?? '') })
    reader.readAsDataURL(file)
  }
  const saveArchive = (event: FormEvent) => {
    event.preventDefault()
    try {
      const savedAt = new Date().toISOString()
      const next = records.map((record) => ({ ...record, _savedAt: savedAt }))
      localStorage.setItem(storageKey, JSON.stringify(next)); setRecords(next); setStatus('长期用药档案已保存')
    } catch { setStatus('保存失败，请缩小图片后重试') }
  }

  return <main className="app-shell min-h-dvh">
    <WebPageHeader fallback="/health-profile" title="长期用药" />
    <div className="page-content health-profile-page-content">
      <MemberIdentityCard member={member} recordSubject />
      <Typography variant="caption">所有字段均可留空，按你了解的情况填写即可</Typography>
      <form className="grid gap-3" id="medication-profile-form" onSubmit={saveArchive}>
        {records.map((record) => {
          const expanded = expandedId === record.id
          const detail = medicationDetailSummary(record)
          const dates = medicationDateSummary(record)
          return <article className="rounded-card border bg-surface p-4" key={record.id}>
            <div className="flex items-center gap-3">
              <MedicationNumber sequence={record.sequence} />
              <button aria-expanded={expanded} className="min-w-0 flex-1 text-left" onClick={() => toggleRecord(record.id)} type="button">
                <strong className="block truncate text-sm">{record.name || `药物 ${record.sequence}`}</strong>
                {!expanded && detail && <span className="mt-1 block truncate text-xs text-text-secondary">{detail}</span>}
                {!expanded && dates && <span className="mt-0.5 block text-xs text-text-secondary">{dates}</span>}
              </button>
              {expanded ? <button className="min-h-11 px-1 text-sm font-medium text-danger" onClick={() => deleteRecord(record.id)} type="button">删除</button> : <button aria-label={`展开药物 ${record.sequence}`} className="grid h-11 w-11 place-items-center rounded-full text-text-secondary" onClick={() => toggleRecord(record.id)} type="button"><ChevronDown size={21} /></button>}
            </div>
            {expanded && <div className="mt-5 grid gap-4">
              <MedicationFields record={record} onChange={(changes) => updateRecord(record.id, changes)} onImage={(event) => attachImage(record.id, event)} />
              <HohoButton onClick={() => setExpandedId('')} type="button" variant="secondary"><Check size={17} />确认并收起</HohoButton>
            </div>}
          </article>
        })}
        <button className="flex min-h-12 items-center justify-center gap-2 rounded-control border border-dashed text-sm font-semibold text-primary" onClick={addRecord} type="button"><Plus size={19} />添加一种药物</button>
        {status && <p className={`text-sm ${status.includes('失败') || status.includes('过大') ? 'text-danger' : 'text-primary'}`} role="status">{status}</p>}
      </form>
    </div>
    <HealthProfileActionBar><HohoButton fullWidth form="medication-profile-form" type="submit">保存档案</HohoButton></HealthProfileActionBar>
  </main>
}

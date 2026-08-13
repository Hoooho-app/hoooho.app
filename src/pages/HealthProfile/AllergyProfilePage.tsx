import { ChangeEvent, FormEvent, useRef, useState } from 'react'
import { Check, ChevronDown, FileText, Plus, Trash2, Upload } from 'lucide-react'
import { WebPageHeader } from '../../components/common'
import { MemberIdentityCard } from '../../components/health'
import { HohoButton, Typography } from '../../components/design-system'
import {
  allergyReactionSummary,
  emptyAllergyRecord,
  nextAllergySequence,
  normalizeAllergyRecords,
  normalizeAllergyReports,
  type AllergyProfileRecord,
  type AllergyReport
} from '../../features/health-profile/utils/allergyProfile'
import type { Member } from '../../types'

const allergyTypes = ['食物', '药物', '吸入 / 环境', '接触物', '昆虫', '其他']
const reactionGroups = [
  { label: '皮肤', options: ['皮疹', '荨麻疹', '瘙痒', '红肿', '其他皮肤表现'] },
  { label: '消化道', options: ['腹痛', '腹泻 / 排便异常', '呕吐', '便血 / 黏液便', '肛周发红', '其他消化道表现'] },
  { label: '鼻 / 眼', options: ['打喷嚏', '流鼻涕', '鼻塞', '眼睛痒 / 红 / 流泪'] },
  { label: '呼吸', options: ['咳嗽', '喘息', '呼吸不适'] },
  { label: '全身', options: ['明显肿胀', '头晕 / 乏力', '严重全身反应'] }
]

function loadJson(key: string) {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as unknown } catch { return [] }
}

function SequenceNumber({ sequence }: { sequence: number }) {
  return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-surface">{sequence}</span>
}

function ChoiceGroup({ label, options, value, columns = 2, onChange }: { label: string; options: string[]; value: string; columns?: 2 | 3; onChange: (value: string) => void }) {
  return <fieldset className="grid gap-2"><legend className="hoho-text-label mb-2">{label}</legend><div className={`grid gap-2 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>{options.map((option) => <button aria-pressed={value === option} className={`min-h-11 rounded-control border px-2 text-sm ${value === option ? 'border-primary bg-primary text-surface' : 'bg-surface text-text-primary'}`} key={option} onClick={() => onChange(value === option ? '' : option)} type="button">{option}</button>)}</div></fieldset>
}

function ReactionSelector({ record, onChange }: { record: AllergyProfileRecord; onChange: (changes: Partial<AllergyProfileRecord>) => void }) {
  const toggle = (reaction: string) => onChange({ reactions: record.reactions.includes(reaction) ? record.reactions.filter((item) => item !== reaction) : [...record.reactions, reaction] })
  return <fieldset className="grid gap-3"><legend className="hoho-text-label mb-2">出现过的反应</legend>{reactionGroups.map((group) => <div className="grid gap-2" key={group.label}><span className="text-xs font-medium text-text-secondary">{group.label}</span><div className="flex flex-wrap gap-2">{group.options.map((reaction) => {
    const selected = record.reactions.includes(reaction)
    return <button aria-pressed={selected} className={`inline-flex min-h-10 items-center gap-1.5 rounded-control border px-3 text-xs ${selected ? 'border-primary bg-primary-soft font-semibold text-primary' : 'bg-surface text-text-secondary'}`} key={reaction} onClick={() => toggle(reaction)} type="button">{selected && <Check size={14} />}{reaction}</button>
  })}</div></div>)}<label className="hoho-field"><span className="hoho-text-label">+ 其他表现</span><input className="hoho-input" value={record.otherReaction} onChange={(event) => onChange({ otherReaction: event.target.value })} /></label></fieldset>
}

function AllergyFields({ record, onChange }: { record: AllergyProfileRecord; onChange: (changes: Partial<AllergyProfileRecord>) => void }) {
  return <div className="grid gap-5">
    <div className="grid grid-cols-2 gap-3">
      <ChoiceGroup label="明确程度" options={['已明确', '怀疑中']} value={record.certainty} onChange={(certainty) => onChange({ certainty })} />
      <label className="hoho-field min-w-0"><span className="hoho-text-label">类型</span><select className="hoho-select" value={record.type} onChange={(event) => onChange({ type: event.target.value })}><option value="">请选择</option>{allergyTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
    </div>
    <label className="hoho-field"><span className="hoho-text-label">过敏 / 反应对象</span><input className="hoho-input" placeholder="例如猫毛、花粉、青霉素" value={record.subject} onChange={(event) => onChange({ subject: event.target.value })} /></label>
    <ReactionSelector record={record} onChange={onChange} />
    <ChoiceGroup columns={3} label="影响程度" options={['轻微', '明显', '严重']} value={record.impact} onChange={(impact) => onChange({ impact })} />
    <label className="hoho-field"><span className="hoho-text-label">平时如何应对</span><textarea className="hoho-textarea" placeholder="记录过去实际如何处理" rows={3} value={record.handling} onChange={(event) => onChange({ handling: event.target.value })} /></label>
  </div>
}

function ReportSection({ reports, onUpload, onDelete }: { reports: AllergyReport[]; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onDelete: (id: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return <section className="grid gap-3 rounded-card border bg-surface p-4">
    <Typography variant="sectionTitle">过敏相关检查</Typography>
    <button className="grid min-h-20 place-items-center rounded-control border border-dashed bg-background px-4 text-center" onClick={() => input.current?.click()} type="button"><span className="grid gap-1"><span className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary"><Upload size={19} />上传检查报告</span><span className="text-xs text-text-secondary">支持拍照、相册或文件上传</span></span></button>
    <input ref={input} accept="image/*,.pdf,application/pdf" className="sr-only" multiple type="file" onChange={onUpload} />
    {reports.map((report) => <article className="flex min-w-0 items-center gap-3 rounded-control border p-3" key={report.id}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-primary-soft text-primary"><FileText size={19} /></span><a className="min-w-0 flex-1" href={report.dataUrl} rel="noreferrer" target="_blank"><span className="block text-xs text-text-secondary">{report.date}</span><strong className="block truncate text-sm">{report.name}</strong><span className="block text-xs text-text-secondary">{report.parsingStatus}</span></a><button aria-label={`删除报告 ${report.name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-danger" onClick={() => onDelete(report.id)} type="button"><Trash2 size={17} /></button></article>)}
  </section>
}

export function AllergyProfilePage({ member, storageKey }: { member: Member; storageKey: string }) {
  const reportKey = `${storageKey}:reports`
  const initial = useState(() => normalizeAllergyRecords(Array.isArray(loadJson(storageKey)) ? loadJson(storageKey) as Record<string, unknown>[] : []))[0]
  const initialReports = useState(() => normalizeAllergyReports(loadJson(reportKey)))[0]
  const [records, setRecords] = useState<AllergyProfileRecord[]>(() => initial.length ? initial : [emptyAllergyRecord(1)])
  const [reports, setReports] = useState<AllergyReport[]>(initialReports)
  const [expandedId, setExpandedId] = useState(() => initial.length ? '' : records[0].id)
  const [status, setStatus] = useState('')

  const updateRecord = (id: string, changes: Partial<AllergyProfileRecord>) => setRecords((current) => current.map((record) => record.id === id ? { ...record, ...changes } : record))
  const addRecord = () => { const next = emptyAllergyRecord(nextAllergySequence(records)); setRecords((current) => [...current, next]); setExpandedId(next.id); setStatus('') }
  const deleteRecord = (id: string) => {
    if (!window.confirm('确认删除这条过敏 / 反应记录吗？')) return
    setRecords((current) => { const next = current.filter((record) => record.id !== id); if (!next.length) { const empty = emptyAllergyRecord(1); setExpandedId(empty.id); return [empty] } setExpandedId(''); return next })
  }
  const uploadReports = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    if (files.some((file) => file.size > 1_500_000)) { setStatus('文件过大，请选择单个 1.5MB 以内的图片或 PDF'); event.target.value = ''; return }
    files.forEach((file, index) => { const reader = new FileReader(); reader.onload = () => setReports((current) => [...current, { id: `allergy-report-${Date.now()}-${index}`, name: file.name, date: new Date().toISOString().slice(0, 10).replaceAll('-', '/'), dataUrl: String(reader.result ?? ''), mimeType: file.type, parsingStatus: '待人工整理' }]); reader.readAsDataURL(file) })
    setStatus('报告已添加，保存档案后持久化'); event.target.value = ''
  }
  const deleteReport = (id: string) => { if (window.confirm('确认删除这份检查报告吗？')) setReports((current) => current.filter((report) => report.id !== id)) }
  const saveArchive = (event: FormEvent) => {
    event.preventDefault()
    try { const savedAt = new Date().toISOString(); const next = records.map((record) => ({ ...record, _savedAt: savedAt })); localStorage.setItem(storageKey, JSON.stringify(next)); localStorage.setItem(reportKey, JSON.stringify(reports)); setRecords(next); setStatus('过敏与不良反应档案已保存') }
    catch { setStatus('保存失败，请缩小报告文件后重试') }
  }

  return <main className="app-shell min-h-dvh">
    <WebPageHeader fallback="/health-profile" title="过敏与不良反应" />
    <div className="page-content pb-[calc(104px+env(safe-area-inset-bottom))]">
      <MemberIdentityCard member={member} recordSubject />
      <Typography variant="caption">所有字段均可留空，按你了解的情况填写即可</Typography>
      <form className="grid gap-3" id="allergy-profile-form" onSubmit={saveArchive}>
        <Typography variant="sectionTitle">已记录</Typography>
        {records.map((record) => {
          const expanded = expandedId === record.id
          const reactions = allergyReactionSummary(record)
          return <article className="rounded-card border bg-surface p-4" key={record.id}>
            <div className="flex items-start gap-3"><SequenceNumber sequence={record.sequence} /><button aria-expanded={expanded} className="min-w-0 flex-1 text-left" onClick={() => setExpandedId(expanded ? '' : record.id)} type="button"><strong className="block truncate text-sm">{record.subject || `过敏 / 反应 ${record.sequence}`}</strong>{!expanded && <><span className="mt-1 block truncate text-xs text-text-secondary">{[record.certainty, record.type].filter(Boolean).join(' · ') || '尚未填写类型'}</span><span className="mt-0.5 block truncate text-xs text-text-secondary">{reactions || '尚未填写反应'} · {record.impact || '程度未知'}</span></>}</button>{expanded ? <button className="min-h-11 px-1 text-sm font-medium text-danger" onClick={() => deleteRecord(record.id)} type="button">删除</button> : <button aria-label={`展开记录 ${record.sequence}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-text-secondary" onClick={() => setExpandedId(record.id)} type="button"><ChevronDown size={21} /></button>}</div>
            {expanded && <div className="mt-5 grid gap-5"><AllergyFields record={record} onChange={(changes) => updateRecord(record.id, changes)} /><HohoButton onClick={() => setExpandedId('')} type="button" variant="secondary"><Check size={17} />确认并收起</HohoButton></div>}
          </article>
        })}
        <button className="flex min-h-12 items-center justify-center gap-2 rounded-control border border-dashed text-sm font-semibold text-primary" onClick={addRecord} type="button"><Plus size={19} />添加一条过敏 / 反应</button>
        <ReportSection reports={reports} onDelete={deleteReport} onUpload={uploadReports} />
        {status && <p className={`text-sm ${status.includes('失败') || status.includes('过大') ? 'text-danger' : 'text-primary'}`} role="status">{status}</p>}
      </form>
    </div>
    <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[402px] -translate-x-1/2 border-t bg-surface px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgb(var(--hoho-color-text-primary)/0.06)]"><HohoButton form="allergy-profile-form" type="submit">保存档案</HohoButton></div>
  </main>
}

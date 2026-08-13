import { ChangeEvent, FormEvent, useRef, useState } from 'react'
import { Check, ChevronDown, FileText, Plus, Trash2, Upload } from 'lucide-react'
import { WebPageHeader } from '../../components/common'
import { BodyLocationPicker, MemberIdentityCard } from '../../components/health'
import { HohoButton, Typography } from '../../components/design-system'
import {
  emptySurgeryRecord,
  nextSurgerySequence,
  normalizeSurgeryRecords,
  normalizeSurgeryReports,
  surgerySummary,
  type SurgeryProfileRecord,
  type SurgeryReport
} from '../../features/health-profile/utils/surgeryProfile'
import type { Member } from '../../types'

function loadJson(key: string) { try { return JSON.parse(localStorage.getItem(key) ?? '[]') as unknown } catch { return [] } }
function SequenceNumber({ sequence }: { sequence: number }) { return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-surface">{sequence}</span> }

function SingleChoice({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return <fieldset className="grid gap-2"><legend className="hoho-text-label mb-2">{label}</legend><div className={`grid gap-2 ${options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>{options.map((option) => <button aria-pressed={value === option} className={`min-h-11 rounded-control border px-2 text-sm ${value === option ? 'border-primary bg-primary text-surface' : 'bg-surface text-text-primary'}`} key={option} onClick={() => onChange(value === option ? '' : option)} type="button">{option}</button>)}</div></fieldset>
}

function SurgeryFields({ member, record, onChange }: { member: Member; record: SurgeryProfileRecord; onChange: (changes: Partial<SurgeryProfileRecord>) => void }) {
  return <div className="grid gap-5">
    <label className="hoho-field"><span className="hoho-text-label">手术名称</span><input className="hoho-input" placeholder="正式名称或日常叫法均可" value={record.name} onChange={(event) => onChange({ name: event.target.value })} /></label>
    <div className="grid grid-cols-2 gap-3"><label className="hoho-field min-w-0"><span className="hoho-text-label">手术时间</span><input className="hoho-input px-2" type="date" value={record.date} onChange={(event) => onChange({ date: event.target.value })} /></label><label className="hoho-field min-w-0"><span className="hoho-text-label">医院 / 医疗机构</span><input className="hoho-input" value={record.hospital} onChange={(event) => onChange({ hospital: event.target.value })} /></label></div>
    <label className="hoho-field"><span className="hoho-text-label">手术原因 / 当时的问题</span><textarea className="hoho-textarea" rows={3} value={record.reason} onChange={(event) => onChange({ reason: event.target.value })} /></label>
    <BodyLocationPicker label="手术部位（可多选）" member={member} onChange={(locations) => onChange({ locations })} value={record.locations} />
    <SingleChoice label="术后情况" options={['恢复良好', '仍有一些影响', '有长期影响']} value={record.recovery} onChange={(recovery) => onChange({ recovery })} />
    <label className="hoho-field"><span className="hoho-text-label">目前还有哪些影响（可选）</span><textarea className="hoho-textarea" rows={3} value={record.remainingImpact} onChange={(event) => onChange({ remainingImpact: event.target.value })} /></label>
    <SingleChoice label="是否有植入物 / 医疗器械" options={['有', '无']} value={record.hasImplant} onChange={(hasImplant) => onChange({ hasImplant, ...(hasImplant === '无' ? { implantName: '' } : {}) })} />
    {record.hasImplant === '有' && <label className="hoho-field"><span className="hoho-text-label">植入物 / 医疗器械名称（可选）</span><input className="hoho-input" placeholder="例如人工关节、心脏支架" value={record.implantName} onChange={(event) => onChange({ implantName: event.target.value })} /></label>}
  </div>
}

function ReportSection({ reports, onUpload, onDelete }: { reports: SurgeryReport[]; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onDelete: (id: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return <section className="grid gap-3 rounded-card border bg-surface p-4"><Typography variant="sectionTitle">手术相关资料</Typography><button className="grid min-h-20 place-items-center rounded-control border border-dashed bg-background px-4 text-center" onClick={() => input.current?.click()} type="button"><span className="grid gap-1"><span className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary"><Upload size={19} />上传手术 / 出院资料</span><span className="text-xs text-text-secondary">支持拍照、相册、PDF 或文件上传</span></span></button><input ref={input} accept="image/*,.pdf,application/pdf" className="sr-only" multiple type="file" onChange={onUpload} />{reports.map((report) => <article className="flex min-w-0 items-center gap-3 rounded-control border p-3" key={report.id}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-primary-soft text-primary"><FileText size={19} /></span><a className="min-w-0 flex-1" href={report.dataUrl} rel="noreferrer" target="_blank"><span className="block text-xs text-text-secondary">{report.date}</span><strong className="block truncate text-sm">{report.name}</strong><span className="block text-xs text-text-secondary">{report.parsingStatus}</span></a><button aria-label={`删除资料 ${report.name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-danger" onClick={() => onDelete(report.id)} type="button"><Trash2 size={17} /></button></article>)}</section>
}

export function SurgeryProfilePage({ member, storageKey }: { member: Member; storageKey: string }) {
  const reportKey = `${storageKey}:reports`
  const initial = useState(() => { const stored = loadJson(storageKey); return normalizeSurgeryRecords(Array.isArray(stored) ? stored as Record<string, unknown>[] : []) })[0]
  const [records, setRecords] = useState<SurgeryProfileRecord[]>(() => initial.length ? initial : [emptySurgeryRecord(1)])
  const [reports, setReports] = useState<SurgeryReport[]>(() => normalizeSurgeryReports(loadJson(reportKey)))
  const [expandedId, setExpandedId] = useState(() => initial.length ? '' : records[0].id)
  const [status, setStatus] = useState('')
  const updateRecord = (id: string, changes: Partial<SurgeryProfileRecord>) => setRecords((current) => current.map((record) => record.id === id ? { ...record, ...changes } : record))
  const addRecord = () => { const next = emptySurgeryRecord(nextSurgerySequence(records)); setRecords((current) => [...current, next]); setExpandedId(next.id); setStatus('') }
  const deleteRecord = (id: string) => { if (!window.confirm('确认删除这条手术记录吗？')) return; setRecords((current) => { const next = current.filter((record) => record.id !== id); if (!next.length) { const empty = emptySurgeryRecord(1); setExpandedId(empty.id); return [empty] } setExpandedId(''); return next }) }
  const uploadReports = (event: ChangeEvent<HTMLInputElement>) => { const files = Array.from(event.target.files ?? []); if (!files.length) return; if (files.some((file) => file.size > 1_500_000)) { setStatus('文件过大，请选择单个 1.5MB 以内的图片或 PDF'); event.target.value = ''; return } files.forEach((file, index) => { const reader = new FileReader(); reader.onload = () => setReports((current) => [...current, { id: `surgery-report-${Date.now()}-${index}`, name: file.name, date: new Date().toISOString().slice(0, 10).replaceAll('-', '/'), dataUrl: String(reader.result ?? ''), mimeType: file.type, parsingStatus: '待人工整理' }]); reader.readAsDataURL(file) }); setStatus('资料已添加，保存档案后持久化'); event.target.value = '' }
  const deleteReport = (id: string) => { if (window.confirm('确认删除这份手术资料吗？')) setReports((current) => current.filter((report) => report.id !== id)) }
  const saveArchive = (event: FormEvent) => { event.preventDefault(); try { const savedAt = new Date().toISOString(); const next = records.map((record) => ({ ...record, _savedAt: savedAt })); localStorage.setItem(storageKey, JSON.stringify(next)); localStorage.setItem(reportKey, JSON.stringify(reports)); setRecords(next); setStatus('手术史档案已保存') } catch { setStatus('保存失败，请缩小资料文件后重试') } }

  return <main className="app-shell min-h-dvh"><WebPageHeader fallback="/health-profile" title="手术史" /><div className="page-content pb-[calc(104px+env(safe-area-inset-bottom))]"><MemberIdentityCard member={member} recordSubject /><Typography variant="caption">所有字段均可留空，按你了解的情况填写即可</Typography><form className="grid gap-3" id="surgery-profile-form" onSubmit={saveArchive}><Typography variant="sectionTitle">已记录的手术（{records.length}）</Typography>{records.map((record) => { const expanded = expandedId === record.id; const summary = surgerySummary(record); return <article className="rounded-card border bg-surface p-4" key={record.id}><div className="flex items-start gap-3"><SequenceNumber sequence={record.sequence} /><button aria-expanded={expanded} className="min-w-0 flex-1 text-left" onClick={() => setExpandedId(expanded ? '' : record.id)} type="button"><strong className="block truncate text-sm">{record.name || `手术 ${record.sequence}`}</strong>{!expanded && <><span className="mt-1 block truncate text-xs text-text-secondary">{summary.context || '时间与医院未填'}</span><span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-text-secondary">{summary.reason || '手术原因未填'}</span>{summary.implant && <span className="mt-0.5 block truncate text-xs text-text-secondary">{summary.implant}</span>}</>}</button>{!expanded && <span className={`mt-1 shrink-0 rounded-pill px-2 py-1 text-xs ${record.recovery === '恢复良好' ? 'bg-primary-soft text-success' : record.recovery ? 'bg-warning/10 text-warning' : 'bg-background text-text-secondary'}`}>{summary.status}</span>}{expanded ? <button className="min-h-11 px-1 text-sm font-medium text-danger" onClick={() => deleteRecord(record.id)} type="button">删除</button> : <button aria-label={`展开手术 ${record.sequence}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-text-secondary" onClick={() => setExpandedId(record.id)} type="button"><ChevronDown size={21} /></button>}</div>{expanded && <div className="mt-5 grid gap-5"><SurgeryFields member={member} record={record} onChange={(changes) => updateRecord(record.id, changes)} /><HohoButton onClick={() => setExpandedId('')} type="button" variant="secondary"><Check size={17} />确认并收起</HohoButton></div>}</article> })}<button className="flex min-h-12 items-center justify-center gap-2 rounded-control border border-dashed text-sm font-semibold text-primary" onClick={addRecord} type="button"><Plus size={19} />添加一次手术</button><ReportSection reports={reports} onDelete={deleteReport} onUpload={uploadReports} />{status && <p className={`text-sm ${status.includes('失败') || status.includes('过大') ? 'text-danger' : 'text-primary'}`} role="status">{status}</p>}</form></div><div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[402px] -translate-x-1/2 border-t bg-surface px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgb(var(--hoho-color-text-primary)/0.06)]"><HohoButton form="surgery-profile-form" type="submit">保存档案</HohoButton></div></main>
}

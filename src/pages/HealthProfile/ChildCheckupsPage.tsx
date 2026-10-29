import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, Ear, Eye, ScanLine, Smile } from '../../components/icons'
import { WebPageHeader } from '../../components/common'
import { HealthRecordSubjectHeader } from '../../components/health'
import { BottomSheetSurface, HealthCard, HealthTag, HohoButton, HohoInput, HohoSection, HohoSurfaceRow, StatusNotice } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import type { Member } from '../../types'
import { type ArchiveRecord, type ArchiveSnapshot, useProfileArchive } from './useProfileArchive'
import { ProfileSourceFiles, profileFiles } from './ProfileSourceFiles'
import { useArchiveEditorExit } from './useArchiveEditorExit'
import './childArchive.css'

const types = [{ id: 'checkup', label: '儿保检查', icon: CalendarCheck }, { id: 'hearing', label: '听力筛查', icon: Ear }, { id: 'newborn', label: '新生儿疾病筛查', icon: ScanLine }, { id: 'vision', label: '视力检查', icon: Eye }, { id: 'oral', label: '口腔检查', icon: Smile }] as const
const text = (v: unknown) => typeof v === 'string' ? v : ''
const today = () => new Date().toLocaleDateString('en-CA')
type Edit = { values: ArchiveRecord; base: ArchiveSnapshot; originalId?: string; dirty?: boolean }
export function ChildCheckupsPage() {
  const { members, currentMemberId, authUser } = useAppStore(), member = members.find(m => m.id === currentMemberId)
  return member ? <Checkups key={`${authUser?.id}:${member.id}`} member={member}/> : <main className="app-shell"><WebPageHeader title="儿保与筛查" fallback="/health-profile"/><p role="status">正在读取孩子资料…</p></main>
}
function Checkups({ member }: { member: Member }) {
  const navigate = useNavigate(), archive = useProfileArchive(member.id, 'checkups')
  const [edit, setEdit] = useState<Edit | null>(null), [error, setError] = useState(''), [message, setMessage] = useState(''), [confirmDelete, setConfirmDelete] = useState(false)
  const locked = useRef(false)
  const [reading, setReading] = useState(false)
  const exit = useArchiveEditorExit(!!edit?.dirty, archive.busy || reading, () => setEdit(null))
  const records = archive.records.filter(r => r.recordType !== 'plan').sort((a, b) => text(b.date).localeCompare(text(a.date)) || text(b.createdAt).localeCompare(text(a.createdAt)) || text(b.id).localeCompare(text(a.id)))
  const plans = archive.records.filter(r => r.recordType === 'plan').sort((a, b) => text(a.date).localeCompare(text(b.date)))
  const open = (type: string, row?: ArchiveRecord, plan = false) => { setError(''); setMessage(''); setConfirmDelete(false); setEdit({ base: structuredClone(archive.snapshot), originalId: row?.id, values: row ? { ...row } : { id: crypto.randomUUID(), recordType: plan ? 'plan' : 'record', type, title: plan ? '' : types.find(t => t.id === type)?.label ?? '', date: '', sourceLabel: '家长手动填写', createdAt: new Date().toISOString() } }) }
  const change = (key: string, value: unknown) => setEdit(e => e ? { ...e, dirty: true, values: { ...e.values, [key]: value } } : e)
  async function save(remove = false) {
    if (!edit || locked.current || reading) return
    locked.current = true; setError('')
    try {
      const v = edit.values
      if (!remove && (!text(v.title).trim() || !text(v.date))) throw new Error('请填写名称和日期')
      if (!remove && v.recordType !== 'plan' && text(v.date) > today()) throw new Error('已完成检查的日期不能晚于今天，请在后续安排中记录计划')
      const next = remove ? edit.base.records.filter(r => r.id !== edit.originalId) : edit.originalId ? edit.base.records.map(r => r.id === edit.originalId ? { ...v, title: text(v.title).trim() } : r) : [...edit.base.records, { ...v, title: text(v.title).trim() }]
      await archive.save(next, edit.base.revision)
      setEdit(null); setMessage(remove ? '已删除' : '已保存')
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试') }
    finally { locked.current = false }
  }
  const enabled = !archive.loading && !archive.error
  const record = (r: ArchiveRecord) => <article className="profile-record" key={r.id}><div className="profile-record-heading"><div><h3>{text(r.title)}</h3><small>{text(r.date)}{text(r.organization) ? ` · ${text(r.organization)}` : ''}</small></div><HohoButton variant="text" aria-label={`编辑${text(r.title)}`} disabled={!enabled} onClick={() => open(text(r.type), r)}>编辑</HohoButton></div>{text(r.conclusion) && <p>{text(r.conclusion)}</p>}{text(r.note) && <p>{text(r.note)}</p>}<p className="profile-muted">来源：{text(r.sourceLabel) || '家长手动填写'}</p><ProfileSourceFiles files={profileFiles(r.sourceFiles)}/>{r.type === 'checkup' && <HohoButton variant="text" onClick={() => navigate('/health-profile/basic')}>查看生长记录</HohoButton>}</article>
  if (!archive.loaded) return <main className="app-shell"><WebPageHeader title="儿保与筛查" fallback="/health-profile"/><div className="page-content child-archive-content"><HealthRecordSubjectHeader member={member} action={<span/>}/>{archive.error ? <StatusNotice tone="error" title="资料读取未完成" children={archive.error} action={<HohoButton onClick={archive.refresh}>重试</HohoButton>}/> : <p role="status">正在读取资料…</p>}</div></main>
  return <main className="app-shell"><WebPageHeader title="儿保与筛查" onBack={() => navigate('/health-profile')}/><div className="page-content child-archive-content">
    <HealthRecordSubjectHeader member={member} action={<span/>}/>
    {archive.loading && <p role="status">正在读取资料…</p>}{archive.error && <StatusNotice tone="error" title={archive.error} action={<HohoButton variant="text" onClick={archive.refresh}>重试</HohoButton>}/>}{message && <p role="status">{message}</p>}
    <HohoSection title="后续安排" action={<HohoButton variant="text" disabled={!enabled} onClick={() => open('checkup', undefined, true)}>添加安排</HohoButton>}>
      {plans.length ? plans.map(r => <HealthCard key={r.id}><div className="profile-record-heading"><div><h3>{text(r.title)}</h3><small>{text(r.date)} · 家长安排</small></div><HealthTag tone="info">待进行</HealthTag></div>{text(r.note) && <p>{text(r.note)}</p>}<HohoButton variant="text" disabled={!enabled} aria-label={`编辑${text(r.title)}`} onClick={() => open(text(r.type), r, true)}>调整安排</HohoButton></HealthCard>) : <p className="profile-muted">{archive.loading ? '读取中…' : '尚未添加安排，可按实际需要填写。'}</p>}
    </HohoSection>
    <HohoSection title="最近儿保">{records.filter(r => r.type === 'checkup').length ? <div>{records.filter(r => r.type === 'checkup').map(record)}</div> : <p className="profile-muted">{archive.loading ? '读取中…' : '尚未记录儿保检查'}</p>}</HohoSection>
    <HohoSection title="筛查资料"><div>{types.filter(t => t.id !== 'checkup').map(({ id, label, icon: Icon }) => { const rows = records.filter(r => r.type === id); return <div key={id}><HohoSurfaceRow leading={<Icon size={20} aria-hidden/>} title={label} description={rows.length ? `${rows.length}条记录 · 最近 ${text(rows[0].date)}` : archive.loading ? '读取中…' : '尚未记录'} onActivate={enabled ? () => open(id) : undefined} value={enabled ? '添加' : undefined}/>{rows.map(record)}</div> })}</div></HohoSection>
    <HohoSection title="下一次就诊前"><p className="hoho-text-body">带上儿童保健手册，可拍照留存本次检查页。</p></HohoSection>
    <HohoButton disabled={!enabled} onClick={() => open('checkup')}>添加儿保或筛查资料</HohoButton>
    <BottomSheetSurface open={!!edit} label="儿保筛查记录" title={edit?.values.recordType === 'plan' ? '后续安排' : '儿保与筛查资料'} viewportAware onClose={exit.requestClose}>
      {edit && <form className="profile-editor" onSubmit={e => { e.preventDefault(); void save() }}><label className="hoho-field"><span>资料类型</span><select aria-label="资料类型" className="hoho-select" disabled={archive.busy} value={text(edit.values.type)} onChange={e => change('type', e.target.value)}>{types.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label><HohoInput label={edit.values.recordType === 'plan' ? '安排名称' : '检查名称'} required maxLength={120} disabled={archive.busy} value={text(edit.values.title)} onChange={e => change('title', e.target.value)}/><HohoInput label={edit.values.recordType === 'plan' ? '安排日期' : '检查日期'} required type="date" max={edit.values.recordType === 'plan' ? undefined : today()} disabled={archive.busy} value={text(edit.values.date)} onChange={e => change('date', e.target.value)}/>
        {edit.values.recordType !== 'plan' && <><HohoInput label="医疗机构（选填）" maxLength={120} disabled={archive.busy} value={text(edit.values.organization)} onChange={e => change('organization', e.target.value)}/><label className="hoho-field"><span>报告结论 / 查体记录</span><textarea className="hoho-textarea" maxLength={3000} disabled={archive.busy} value={text(edit.values.conclusion)} onChange={e => change('conclusion', e.target.value)}/></label><HohoInput label="资料来源" maxLength={200} disabled={archive.busy} value={text(edit.values.sourceLabel)} onChange={e => change('sourceLabel', e.target.value)}/><ProfileSourceFiles onReadingChange={setReading} files={profileFiles(edit.values.sourceFiles)} disabled={archive.busy || reading} onChange={v => change('sourceFiles', v)}/></>}
        <label className="hoho-field"><span>{edit.values.recordType === 'plan' ? '安排说明（选填）' : '随访安排 / 补充说明（选填）'}</span><textarea className="hoho-textarea" maxLength={2000} disabled={archive.busy} value={text(edit.values.note)} onChange={e => change('note', e.target.value)}/></label>
        {error && <p role="alert">{error}。填写内容仍保留。</p>}<HohoButton disabled={reading} loading={archive.busy} type="submit" fullWidth>保存</HohoButton>{edit.originalId && (confirmDelete ? <div className="profile-actions"><HohoButton variant="danger" loading={archive.busy} onClick={() => void save(true)}>确认删除此条</HohoButton><HohoButton variant="text" disabled={archive.busy} onClick={() => setConfirmDelete(false)}>取消删除</HohoButton></div> : <HohoButton variant="text" disabled={archive.busy} onClick={() => setConfirmDelete(true)}>删除这条记录</HohoButton>)}
      </form>}
    </BottomSheetSurface>
    {exit.confirmation}
  </div></main>
}

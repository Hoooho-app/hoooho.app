import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Camera, Syringe } from '../../components/icons'
import { WebPageHeader } from '../../components/common'
import { HealthRecordSubjectHeader } from '../../components/health'
import { BottomSheetSurface, HealthTag, HohoButton, HohoInput, HohoSection, HohoSegmentedControl, SproutEntry, StatusNotice } from '../../components/design-system'
import { RecordOriginals } from '../../features/ai-business/RecordOriginals'
import { apiRequest } from '../../services/apiClient'
import { announceProfileSectionsChange, subscribeProfileSectionInvalidation } from '../../services/profileSectionStorage'
import { useAppStore } from '../../store/useAppStore'
import type { Member } from '../../types'
import { ProfileUploadBatch } from './ProfileUploadBatch'
import { ProfileSourceFiles, profileFiles, type ProfileFile } from './ProfileSourceFiles'
import { type ArchiveRecord, type ArchiveSnapshot, useProfileArchive } from './useProfileArchive'
import './childArchive.css'

type Row = { id: string; name: string; displayName?: string; version: string; date: string; group: string; doseSequence?: string; dose?: string; createdAt?: string; eventId?: string; recordId?: string; attachmentIds?: string[]; sourceFiles?: ProfileFile[]; sourceLabel?: string }
type Snapshot = { rows: Row[]; notice?: string; undoId?: string }
type Edit = { name: string; date: string; dateDirty: boolean; doseSequence: string; doseDirty: boolean; key: string; row?: Row }
type PlanEdit = { base: ArchiveSnapshot; values: ArchiveRecord; originalId?: string }
const doses = [{ value: 'unknown', label: '剂次未填写' }, { value: 'dose_1', label: '第1剂' }, { value: 'dose_2', label: '第2剂' }, { value: 'dose_3', label: '第3剂' }, { value: 'dose_4', label: '第4剂' }, { value: 'booster', label: '加强剂' }]
const text = (v: unknown) => typeof v === 'string' ? v : ''
const today = () => new Date().toLocaleDateString('en-CA')
export function VaccinationRecordsPage() {
  const location = useLocation(), requestedMember = new URLSearchParams(location.search).get('memberId')
  const { members, currentMemberId, authUser } = useAppStore(), member = members.find(m => m.id === currentMemberId)
  if (requestedMember && requestedMember !== currentMemberId) return <main className="app-shell"><WebPageHeader title="接种记录" fallback="/health-profile"/><p role="status">这条记录不属于当前孩子</p></main>
  return member ? <VaccinationRecords key={`${authUser?.id}:${member.id}`} member={member}/> : <main className="app-shell"><WebPageHeader title="接种记录" fallback="/health-profile"/><p role="status">正在读取孩子资料…</p></main>
}
function VaccinationRecords({ member }: { member: Member }) {
  const navigate = useNavigate(), token = useAppStore(s => s.authToken), accountId = useAppStore(s => s.authUser?.id)
  const plans = useProfileArchive(member.id, 'vaccination-plans'), [tab, setTab] = useState<'completed' | 'plans'>('completed')
  const [data, setData] = useState<Snapshot | null>(null), [loading, setLoading] = useState(true), [reload, setReload] = useState(0), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [edit, setEdit] = useState<Edit | null>(null), [plan, setPlan] = useState<PlanEdit | null>(null), [deleting, setDeleting] = useState(false), [undo, setUndo] = useState('')
  const locked = useRef(false), mounted = useRef(true), generation = useRef(0)
  const endpoint = `/api/members/${encodeURIComponent(member.id)}/profile-list/vaccination`
  const location = useLocation(), focusedEntry = new URLSearchParams(location.search).get('entryId')
  const draftKey = `hoooho:vaccination-draft:${accountId}:${member.id}`
  const [restored, setRestored] = useState(false)
  useEffect(() => { try { const draft = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null'); if (draft?.edit) setEdit(draft.edit); if (draft?.plan) setPlan(draft.plan) } catch { /* Unavailable storage must not block records. */ } setRestored(true) }, [draftKey])
  useEffect(() => { if (restored) try { if (edit || plan) sessionStorage.setItem(draftKey, JSON.stringify({ edit, plan })); else sessionStorage.removeItem(draftKey) } catch { /* Current in-memory draft remains editable. */ } }, [restored, draftKey, edit, plan])
  useEffect(() => {
    if (loading || !data || !focusedEntry) return
    const row = Array.from(document.querySelectorAll<HTMLElement>('[data-record-id]')).find(e => e.dataset.recordId === focusedEntry)
    if (row) { row.tabIndex = -1; row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'center' }) }
    else setMessage('这条记录已不存在或暂不可访问')
  }, [loading, data, focusedEntry])
  const [openOriginals, setOpenOriginals] = useState<string[]>([])
  const current = () => { const s = useAppStore.getState(); return s.currentMemberId === member.id && s.authUser?.id === accountId }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++ } }, [])
  useEffect(() => {
    const refresh = () => { if (!locked.current) setReload(v => v + 1) }, unsubscribe = subscribeProfileSectionInvalidation(refresh)
    window.addEventListener('focus', refresh); return () => { unsubscribe(); window.removeEventListener('focus', refresh) }
  }, [])
  useEffect(() => {
    const controller = new AbortController(), version = ++generation.current
    if (!token) return
    setLoading(true); setError('')
    void apiRequest<Snapshot>(endpoint, { token, signal: controller.signal }).then(next => { if (version === generation.current && current()) setData(next) }).catch(e => { if (!controller.signal.aborted && version === generation.current) setError(e instanceof Error ? e.message : '读取失败，请重试') }).finally(() => { if (!controller.signal.aborted && version === generation.current) setLoading(false) })
    return () => controller.abort()
  }, [token, endpoint, reload])
  async function command(input: Record<string, unknown>) {
    if (locked.current) return
    if (!current()) { setError('孩子或账号已切换，内容未提交'); return }
    locked.current = true; generation.current++; setBusy(true); setError('')
    try {
      const next = await apiRequest<Snapshot>(endpoint, { token: useAppStore.getState().authToken ?? '', method: 'POST', body: input })
      if (mounted.current && current()) { setData(next); setEdit(null); setDeleting(false); setMessage(next.notice ?? '已保存'); setUndo(next.undoId ?? ''); setLoading(false) }
      announceProfileSectionsChange()
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '保存失败，填写内容仍保留') }
    finally { locked.current = false; if (mounted.current) { setBusy(false); setLoading(false) } }
  }
  const begin = (row?: Row) => { setError(''); setMessage(''); setDeleting(false); setEdit({ row: row ? { ...row, sourceFiles: undefined } : undefined, name: row?.name ?? '', date: row?.date ?? '', dateDirty: false, doseSequence: row?.doseSequence ?? 'unknown', doseDirty: false, key: crypto.randomUUID() }) }
  const change = (changes: Partial<Edit>) => setEdit(e => e ? { ...e, ...changes, key: crypto.randomUUID() } : e)
  const openPlan = (row?: ArchiveRecord) => { setError(''); setUndo(''); setMessage(''); setDeleting(false); setPlan({ base: structuredClone(plans.snapshot), originalId: row?.id, values: row ? { ...row } : { id: crypto.randomUUID(), title: '', plannedOn: '', source: 'caregiver', note: '', createdAt: new Date().toISOString() } }) }
  async function savePlan(remove = false) {
    if (!plan || locked.current) return
    locked.current = true; setError('')
    try {
      if (!remove && (!text(plan.values.title).trim() || !text(plan.values.plannedOn))) throw new Error('请填写安排名称和日期')
      const next = remove ? plan.base.records.filter(r => r.id !== plan.originalId) : plan.originalId ? plan.base.records.map(r => r.id === plan.originalId ? plan.values : r) : [...plan.base.records, plan.values]
      await plans.save(next, plan.base.revision); if (mounted.current && current()) { setPlan(null); setUndo(''); setMessage(remove ? '已删除安排' : '安排已保存') }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '保存失败，填写内容仍保留') }
    finally { locked.current = false }
  }
  const rows = [...data?.rows ?? []].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id.localeCompare(a.id))
  const originals = [...new Map(rows.filter(r => r.eventId && r.recordId && r.attachmentIds?.length).map(r => [r.recordId!, r])).values()]
  const canEdit = !!data && !loading && !busy, canPlan = !plans.loading && !plans.error && !plans.busy
  return <main className="app-shell"><WebPageHeader title="接种记录" onBack={() => navigate('/health-profile')}/><div className="page-content child-archive-content">
    <HealthRecordSubjectHeader member={member} action={<span/>}/>
    <SproutEntry to="/health-profile/vaccination/plan" title="地区疫苗资料" description="核对接种地区与官方程序"/>
    <HohoSegmentedControl label="接种记录范围" options={[{ value: 'completed', label: `已接种${data ? ` ${rows.length}` : ''}` }, { value: 'plans', label: `后续安排${!plans.loading && !plans.error ? ` ${plans.records.length}` : ''}` }]} value={tab} onChange={setTab}/>
    {loading && <p role="status">正在读取接种记录…</p>}{(error || plans.error) && <StatusNotice tone="error" title={error || plans.error} action={<HohoButton variant="text" disabled={busy || plans.busy} onClick={() => { setReload(v => v + 1); plans.refresh() }}>重新读取</HohoButton>}/>}{message && <p role="status">{message}{undo && <HohoButton variant="text" disabled={busy} onClick={() => void command({ action: 'restore', undoId: undo, key: crypto.randomUUID() })}>撤销</HohoButton>}</p>}
    {tab === 'completed' ? <>
      <HohoSection title="接种记录">{rows.length ? rows.map(row => <article className="profile-record" data-record-id={row.id} key={row.id}><div className="profile-record-heading"><div><h3>{`${row.name}${row.doseSequence && row.doseSequence !== 'unknown' ? ` · ${doses.find(d => d.value === row.doseSequence)?.label ?? ''}` : row.dose ? ` · ${row.dose}` : ''}`}</h3><small>{row.date || '接种日期未填写'} · {row.sourceLabel ?? '既有档案'}</small></div><HealthTag tone="success">已接种</HealthTag></div><HohoButton variant="text" aria-label={`编辑${row.name}`} disabled={!canEdit} onClick={() => begin(row)}>编辑</HohoButton></article>) : !loading && data && <p className="profile-muted">尚未录入接种记录</p>}</HohoSection>
      <HohoSection title="原始资料"><div className="profile-stack">{originals.map(row => <details key={row.recordId} onToggle={e => { const opened = e.currentTarget.open; setOpenOriginals(ids => opened ? [...new Set([...ids, row.recordId!])] : ids.filter(id => id !== row.recordId)) }}><summary>{row.date || '日期未填写'} · 接种资料</summary>{openOriginals.includes(row.recordId!) && <RecordOriginals eventId={row.eventId!} recordId={row.recordId} attachmentIds={row.attachmentIds}/>}</details>)}{rows.filter(r => profileFiles(r.sourceFiles).length).map(row => <ProfileSourceFiles key={row.id} files={profileFiles(row.sourceFiles)}/>)}{!originals.length && !rows.some(r => profileFiles(r.sourceFiles).length) && <p className="profile-muted">尚未关联接种证或原始资料，可拍照添加。</p>}</div></HohoSection>
      <div className="profile-actions"><ProfileUploadBatch member={member} token={token ?? ''} onSaved={() => setReload(v => v + 1)} renderTrigger={({ disabled, onCameraClick, onClick }) => <><HohoButton disabled={disabled || busy} onClick={onCameraClick}><Camera size={18} aria-hidden/>拍接种证</HohoButton><HohoButton variant="text" disabled={disabled || busy} onClick={onClick}>从相册或文件添加</HohoButton></>}/><HohoButton variant="secondary" disabled={!canEdit} onClick={() => begin()}><Syringe size={18} aria-hidden/>手动补充</HohoButton></div>
    </> : <HohoSection title="后续安排" action={<HohoButton variant="text" disabled={!canPlan} onClick={() => openPlan()}>添加安排</HohoButton>}><div className="profile-stack"><p className="profile-muted">家长手动安排。是否接种及具体安排，以接种门诊核对为准。</p>{plans.loading ? <p role="status">正在读取安排…</p> : plans.records.length ? [...plans.records].sort((a, b) => text(a.plannedOn).localeCompare(text(b.plannedOn))).map(row => <article className="profile-record" data-record-id={row.id} key={row.id}><div className="profile-record-heading"><div><h3>{text(row.title)}</h3><small>{text(row.plannedOn)} · 家长手动安排</small></div><HealthTag tone="info">计划</HealthTag></div>{text(row.note) && <p>{text(row.note)}</p>}<HohoButton variant="text" disabled={!canPlan} onClick={() => openPlan(row)} aria-label={`调整${text(row.title)}`}>调整安排</HohoButton></article>) : !plans.error && <p className="profile-muted">尚未添加后续安排</p>}</div></HohoSection>}
    <BottomSheetSurface open={!!edit} label="接种记录编辑" title={edit?.row ? '编辑接种记录' : '手动补充接种记录'} viewportAware onClose={() => { if (!busy) setEdit(null) }}>
      {edit && <form className="profile-editor" onSubmit={e => { e.preventDefault(); void command({ action: edit.row ? 'edit' : 'add', id: edit.row?.id, version: edit.row?.version, name: edit.name, ...(!edit.row || edit.dateDirty ? { date: edit.date } : {}), group: edit.row?.group ?? '年龄待确认', key: edit.key, ...(!edit.row || edit.doseDirty ? { doseSequence: edit.doseSequence } : {}) }) }}><HohoInput label="疫苗名称" required maxLength={120} disabled={busy} value={edit.name} onChange={e => change({ name: e.target.value })}/><label className="hoho-field"><span>剂次</span><select aria-label="剂次" className="hoho-select" disabled={busy} value={edit.doseSequence} onChange={e => change({ doseSequence: e.target.value, doseDirty: true })}>{doses.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}</select>{edit.row?.dose && !edit.doseDirty && <small>原剂次：{edit.row.dose}</small>}</label><HohoInput label="接种日期（可留空待核对）" type="date" max={today()} disabled={busy} value={edit.date} onChange={e => change({ date: e.target.value, dateDirty: true })}/>{error && <p role="alert">{error}。填写内容仍保留。</p>}<HohoButton loading={busy} type="submit" fullWidth>保存</HohoButton>{edit.row && (deleting ? <div className="profile-actions"><HohoButton variant="danger" loading={busy} onClick={() => void command({ action: 'delete', id: edit.row?.id, version: edit.row?.version, key: crypto.randomUUID() })}>确认删除此条</HohoButton><HohoButton variant="text" disabled={busy} onClick={() => setDeleting(false)}>取消删除</HohoButton></div> : <HohoButton variant="text" disabled={busy} onClick={() => setDeleting(true)}>删除这条记录</HohoButton>)}</form>}
    </BottomSheetSurface>
    <BottomSheetSurface open={!!plan} label="接种安排编辑" title="后续接种安排" viewportAware onClose={() => { if (!plans.busy) setPlan(null) }}>
      {plan && <form className="profile-editor" onSubmit={e => { e.preventDefault(); void savePlan() }}><HohoInput label="安排名称" required maxLength={120} disabled={plans.busy} value={text(plan.values.title)} onChange={e => setPlan(p => p ? { ...p, values: { ...p.values, title: e.target.value } } : p)}/><HohoInput label="安排日期" required type="date" disabled={plans.busy} value={text(plan.values.plannedOn)} onChange={e => setPlan(p => p ? { ...p, values: { ...p.values, plannedOn: e.target.value } } : p)}/><HohoInput label="安排说明（选填）" maxLength={1000} disabled={plans.busy} value={text(plan.values.note)} onChange={e => setPlan(p => p ? { ...p, values: { ...p.values, note: e.target.value } } : p)}/>{error && <p role="alert">{error}。填写内容仍保留。</p>}<HohoButton loading={plans.busy} type="submit" fullWidth>保存安排</HohoButton>{plan.originalId && (deleting ? <div className="profile-actions"><HohoButton variant="danger" loading={plans.busy} onClick={() => void savePlan(true)}>确认删除安排</HohoButton><HohoButton variant="text" disabled={plans.busy} onClick={() => setDeleting(false)}>取消删除</HohoButton></div> : <HohoButton variant="text" disabled={plans.busy} onClick={() => setDeleting(true)}>删除安排</HohoButton>)}</form>}
    </BottomSheetSurface>
  </div></main>
}

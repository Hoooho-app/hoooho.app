import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { WebPageHeader } from '../../components/common'
import { HealthRecordSubjectHeader } from '../../components/health'
import { BottomSheetSurface, HealthCard, HohoButton, HohoInput, HohoSection, HohoSurfaceRow, StatusNotice } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import type { Member } from '../../types'
import { type ArchiveRecord, type ArchiveSnapshot, useProfileArchive } from './useProfileArchive'
import { ProfileSourceFiles, profileFiles } from './ProfileSourceFiles'
import { useArchiveEditorExit } from './useArchiveEditorExit'
import './childArchive.css'

const text = (v: unknown) => typeof v === 'string' || typeof v === 'number' ? String(v) : ''
const today = () => new Date().toLocaleDateString('en-CA')
type Edit = { kind: 'region' | 'birth' | 'blood' | 'newborn'; base: ArchiveSnapshot; values: ArchiveRecord; bloodBase?: { abo: string; rh: string }; bloodDirty?: boolean; dirty?: boolean }
export function ChildIdentityPage() {
  const { members, currentMemberId, authUser } = useAppStore(), member = members.find(m => m.id === currentMemberId)
  return member ? <ChildIdentity key={`${authUser?.id}:${member.id}`} member={member}/> : <main className="app-shell"><WebPageHeader title="基本资料与出生背景" fallback="/health-profile"/><p role="status">正在读取孩子资料…</p></main>
}
function ChildIdentity({ member }: { member: Member }) {
  const navigate = useNavigate(), identity = useProfileArchive(member.id, 'identity'), birth = useProfileArchive(member.id, 'birth')
  const [edit, setEdit] = useState<Edit | null>(null), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const locked = useRef(false), owner = useRef(useAppStore.getState().authUser?.id)
  const [reading, setReading] = useState(false)
  const exit = useArchiveEditorExit(!!edit?.dirty, busy || reading, () => setEdit(null))
  const info = identity.records[0] ?? {}, born = birth.records[0] ?? {}
  const display = (v: unknown, unit = '') => text(v) ? `${text(v)}${unit}` : '未填写'
  const open = (kind: Edit['kind']) => {
    const archive = kind === 'birth' ? birth : identity
    if (archive.loading || archive.error) return
    const bloodBase = { abo: member.bloodType ?? '', rh: member.rhBloodType ?? '' }
    setError(''); setMessage(''); setEdit({ kind, base: structuredClone(archive.snapshot), bloodBase, values: { ...(archive.records[0] ?? {}), ...(kind === 'blood' ? bloodBase : {}) } })
  }
  const change = (key: string, value: unknown) => setEdit(e => e ? { ...e, dirty: true, bloodDirty: e.bloodDirty || key === 'abo' || key === 'rh', values: { ...e.values, [key]: value } } : e)
  const checkOwner = () => { const s = useAppStore.getState(); if (s.currentMemberId !== member.id || s.authUser?.id !== owner.current) throw new Error('孩子或账号已切换，内容未提交'); return s }
  async function save() {
    if (!edit || locked.current || reading) return
    locked.current = true; setBusy(true); setError('')
    let memberSaved = false
    try {
      const s = checkOwner(), values = { ...edit.values }, archive = edit.kind === 'birth' ? birth : identity
      if (edit.kind === 'birth') {
        for (const [key, min, max] of [['gestationalWeeks', 15, 45], ['gestationalDays', 0, 6], ['birthWeight', .1, 10], ['birthLength', 10, 80]] as const) {
          const value = text(values[key]); if (value && (!Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max || (key.startsWith('gestational') && !Number.isInteger(Number(value))))) throw new Error('请核对出生孕周、天数、体重和身长的填写范围')
        }
      }
      if (edit.kind === 'blood') {
        if (text(values.bloodTestDate) > today()) throw new Error('检验日期不能晚于今天')
        if (edit.bloodDirty) {
          const latest = await familyMemberService.getById(member.id, s.authToken ?? '')
          if ((latest.bloodType ?? '') !== edit.bloodBase?.abo || (latest.rhBloodType ?? '') !== edit.bloodBase?.rh) throw new Error('血型已在其他页面更新，请重新打开核对；本次填写仍保留')
          checkOwner()
          const saved = await familyMemberService.update(member.id, { ...(text(values.abo) !== edit.bloodBase?.abo ? { bloodType: text(values.abo) as Member['bloodType'] || null } : {}), ...(text(values.rh) !== edit.bloodBase?.rh ? { rhBloodType: text(values.rh) as Member['rhBloodType'] || null } : {}) }, s.authToken ?? '')
          checkOwner(); const current = useAppStore.getState(); current.setMembers(current.members.map(m => m.id === member.id ? adaptFamilyMember(saved) : m)); memberSaved = true
          setEdit(e => e ? { ...e, bloodBase: { abo: saved.bloodType ?? '', rh: saved.rhBloodType ?? '' }, bloodDirty: false } : e)
        }
        delete values.abo; delete values.rh
      }
      await archive.save([{ ...values, id: values.id ?? crypto.randomUUID() }, ...edit.base.records.slice(1)], edit.base.revision)
      checkOwner(); setEdit(null); setMessage('已保存')
    } catch (e) { setError(`${memberSaved ? '血型已保存；来源资料尚未保存。' : ''}${e instanceof Error ? e.message : '保存失败，填写内容仍保留'}`) }
    finally { locked.current = false; setBusy(false) }
  }
  const editAction = (kind: Edit['kind'], label = '编辑') => <HohoButton variant="text" disabled={identity.loading || birth.loading || !!identity.error || !!birth.error} onClick={() => open(kind)} aria-label={`编辑${kind === 'birth' ? '出生背景' : kind === 'blood' ? '血型' : kind === 'newborn' ? '新生儿资料' : '常住地区'}`}><Pencil size={16} aria-hidden/>{label}</HohoButton>
  const titles = { region: '常住地区', birth: '出生背景', blood: '血型与检验依据', newborn: '新生儿资料' }
  if (!identity.loaded || !birth.loaded) return <main className="app-shell"><WebPageHeader title="基本资料与出生背景" fallback="/health-profile"/><div className="page-content child-archive-content"><HealthRecordSubjectHeader member={member} action={<span/>}/>{identity.error || birth.error ? <StatusNotice tone="error" title="资料读取未完成" children={identity.error || birth.error} action={<HohoButton onClick={() => { identity.refresh(); birth.refresh() }}>重试</HohoButton>}/> : <p role="status">正在读取档案…</p>}</div></main>
  return <main className="app-shell"><WebPageHeader title="基本资料与出生背景" onBack={() => navigate('/health-profile')}/><div className="page-content child-archive-content">
    <HealthRecordSubjectHeader member={member} action={<span/>}/>
    {(identity.loading || birth.loading) && <p role="status">正在读取档案…</p>}
    {(identity.error || birth.error) && <StatusNotice tone="error" title={identity.error || birth.error} action={<HohoButton variant="text" onClick={() => { identity.refresh(); birth.refresh() }}>重试</HohoButton>}/>}
    {message && <p role="status">{message}</p>}
    <HohoSection title="基本资料" action={<HohoButton variant="text" onClick={() => navigate(`/family/${member.id}/edit`, { state: { profileReturnTo: '/health-profile/identity' } })}><Pencil size={16} aria-hidden/>编辑</HohoButton>}>
      <HealthCard><dl className="profile-values"><div><dt>姓名</dt><dd>{member.name}</dd></div><div><dt>性别</dt><dd>{member.gender === 'female' ? '女' : member.gender === 'male' ? '男' : '未填写'}</dd></div><div><dt>出生日期</dt><dd>{member.birthday || '未填写'}</dd></div><div><dt>当前年龄</dt><dd>{member.birthday ? formatAgeFromBirthday(member.birthday) : '未填写'}</dd></div><div><dt>常住地区</dt><dd>{identity.loading ? '读取中…' : display(info.region)}</dd></div></dl>{editAction('region', '填写地区')}</HealthCard>
    </HohoSection>
    <HohoSection title="出生背景" action={editAction('birth')}><HealthCard className="profile-stack"><dl className="profile-values"><div><dt>出生孕周</dt><dd>{text(born.gestationalWeeks) ? `${text(born.gestationalWeeks)}周${text(born.gestationalDays) ? ` + ${text(born.gestationalDays)}天` : ''}` : '未填写'}</dd></div><div><dt>出生体重</dt><dd>{display(born.birthWeight, ' kg')}</dd></div><div><dt>出生身长</dt><dd>{display(born.birthLength, ' cm')}</dd></div><div><dt>分娩方式</dt><dd>{display(born.delivery)}</dd></div></dl>{text(born.neonatal) && <p>{text(born.neonatal)}</p>}{text(born.sourceLabel) && <p className="profile-muted">资料来源：{text(born.sourceLabel)}</p>}<ProfileSourceFiles files={profileFiles(born.sourceFiles)}/></HealthCard></HohoSection>
    <HohoSection title="血型" action={editAction('blood')}><HealthCard className="profile-stack"><dl className="profile-values"><div><dt>ABO 血型</dt><dd>{member.bloodType ? `${member.bloodType}型` : '未填写'}</dd></div><div><dt>RhD</dt><dd>{member.rhBloodType === 'positive' ? '阳性' : member.rhBloodType === 'negative' ? '阴性' : '未填写'}</dd></div><div><dt>检验日期</dt><dd>{display(info.bloodTestDate)}</dd></div></dl>{text(info.bloodSource) && <p className="profile-muted">资料来源：{text(info.bloodSource)}</p>}<ProfileSourceFiles files={profileFiles(info.bloodFiles)}/></HealthCard></HohoSection>
    <HohoSection title="新生儿资料" action={editAction('newborn')}><div className="profile-stack"><HohoSurfaceRow title="新生儿出院记录" description={identity.loading ? '读取中…' : profileFiles(info.dischargeFiles).length ? '原件已保存' : '尚未添加原件'} onActivate={!identity.loading && !identity.error ? () => open('newborn') : undefined}/><ProfileSourceFiles files={profileFiles(info.dischargeFiles)}/><HohoSurfaceRow title="新生儿筛查报告" description={identity.loading ? '读取中…' : profileFiles(info.newbornFiles).length ? '原件已保存' : '尚未添加原件'} onActivate={!identity.loading && !identity.error ? () => open('newborn') : undefined}/><ProfileSourceFiles files={profileFiles(info.newbornFiles)}/></div></HohoSection>
    <HohoButton disabled={birth.loading || !!birth.error} onClick={() => open('birth')}>补充出生资料</HohoButton>
    <BottomSheetSurface open={!!edit} title={edit ? titles[edit.kind] : ''} label="编辑基本档案" viewportAware onClose={exit.requestClose}>
      {edit && <form className="profile-editor" onSubmit={e => { e.preventDefault(); void save() }}>
        {edit.kind === 'region' && <HohoInput label="常住地区" placeholder="如：中国大陆 · 浙江杭州" value={text(edit.values.region)} maxLength={120} disabled={busy} onChange={e => change('region', e.target.value)}/>}
        {edit.kind === 'birth' && <><div className="profile-form-grid"><HohoInput label="出生孕周（周）" type="number" min={15} max={45} step={1} value={text(edit.values.gestationalWeeks)} onChange={e => change('gestationalWeeks', e.target.value)}/><HohoInput label="额外天数（天）" type="number" min={0} max={6} step={1} value={text(edit.values.gestationalDays)} onChange={e => change('gestationalDays', e.target.value)}/><HohoInput label="出生体重（kg）" type="number" min={.1} max={10} step={.01} value={text(edit.values.birthWeight)} onChange={e => change('birthWeight', e.target.value)}/><HohoInput label="出生身长（cm）" type="number" min={10} max={80} step={.1} value={text(edit.values.birthLength)} onChange={e => change('birthLength', e.target.value)}/></div><label className="hoho-field"><span>分娩方式</span><select aria-label="分娩方式" className="hoho-select" value={text(edit.values.delivery)} onChange={e => change('delivery', e.target.value)}><option value="">未填写</option>{['顺产', '剖宫产', '助产', '其他'].map(v => <option key={v}>{v}</option>)}</select></label><label className="hoho-field"><span>新生儿时期的重要情况</span><textarea className="hoho-textarea" maxLength={2000} value={text(edit.values.neonatal)} onChange={e => change('neonatal', e.target.value)}/></label><HohoInput label="资料来源" value={text(edit.values.sourceLabel)} maxLength={200} onChange={e => change('sourceLabel', e.target.value)}/><ProfileSourceFiles onReadingChange={setReading} disabled={busy || reading} files={profileFiles(edit.values.sourceFiles)} onChange={v => change('sourceFiles', v)}/></>}
        {edit.kind === 'blood' && <><div className="profile-form-grid"><label className="hoho-field"><span>ABO 血型</span><select aria-label="ABO 血型" className="hoho-select" value={text(edit.values.abo)} onChange={e => change('abo', e.target.value)}><option value="">未填写</option>{['A', 'B', 'AB', 'O'].map(v => <option key={v} value={v}>{v}型</option>)}</select></label><label className="hoho-field"><span>RhD</span><select aria-label="RhD" className="hoho-select" value={text(edit.values.rh)} onChange={e => change('rh', e.target.value)}><option value="">未填写</option><option value="positive">阳性</option><option value="negative">阴性</option></select></label></div><HohoInput label="检验日期" type="date" max={today()} value={text(edit.values.bloodTestDate)} onChange={e => change('bloodTestDate', e.target.value)}/><HohoInput label="血型资料来源" maxLength={200} value={text(edit.values.bloodSource)} onChange={e => change('bloodSource', e.target.value)}/><ProfileSourceFiles onReadingChange={setReading} disabled={busy || reading} files={profileFiles(edit.values.bloodFiles)} onChange={v => change('bloodFiles', v)}/></>}
        {edit.kind === 'newborn' && <><h3 className="hoho-text-card-title">新生儿出院记录</h3><ProfileSourceFiles onReadingChange={setReading} disabled={busy || reading} files={profileFiles(edit.values.dischargeFiles)} onChange={v => change('dischargeFiles', v)}/><h3 className="hoho-text-card-title">新生儿筛查报告</h3><ProfileSourceFiles onReadingChange={setReading} disabled={busy || reading} files={profileFiles(edit.values.newbornFiles)} onChange={v => change('newbornFiles', v)}/></>}
        {error && <p role="alert">{error}。填写内容仍保留。</p>}
        <HohoButton type="submit" loading={busy} disabled={reading} fullWidth>{reading ? '正在读取原件…' : '保存'}</HohoButton>
      </form>}
    </BottomSheetSurface>
    {exit.confirmation}
  </div></main>
}

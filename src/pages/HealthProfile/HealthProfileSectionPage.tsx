import { FormEvent, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { HohoButton, Typography } from '../../components/design-system'
import { healthProfileSectionMap, type HealthProfileField, type HealthProfileSectionId } from '../../features/health-profile/config/healthProfileSections'
import { getBasicHealthProfileValues, getInitialHealthProfileRecords, toFamilyMemberHealthUpdate } from '../../features/health-profile/utils/healthProfileBasicInfo'
import { getInitialHealthProfileSectionView } from '../../features/health-profile/utils/healthProfileSectionFlow'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'

type FormValues = Record<string, string | boolean>

function Field({ field, value, onChange }: { field: HealthProfileField; value: string | boolean; onChange: (value: string | boolean) => void }) {
  if (field.type === 'textarea') return (
    <label className="hoho-field"><span className="hoho-text-label">{field.label}</span><textarea className="hoho-textarea" placeholder={field.placeholder} rows={3} value={String(value)} onChange={(event) => onChange(event.target.value)} /></label>
  )
  if (field.type === 'select') return (
    <label className="hoho-field"><span className="hoho-text-label">{field.label}</span><select className="hoho-select" value={String(value)} onChange={(event) => onChange(event.target.value)}><option value="">请选择</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select></label>
  )
  if (field.type === 'checkbox') return (
    <label className="flex min-h-12 items-center justify-between rounded-control border bg-surface px-3"><span className="hoho-text-label">{field.label}</span><input checked={Boolean(value)} type="checkbox" onChange={(event) => onChange(event.target.checked)} /></label>
  )
  return (
    <label className="hoho-field"><span className="hoho-text-label">{field.label}</span><span className="relative"><input className="hoho-input pr-16" placeholder={field.placeholder} type={field.type} value={String(value)} onChange={(event) => onChange(event.target.value)} />{field.unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary">{field.unit}</span>}</span></label>
  )
}

export function HealthProfileSectionPage() {
  const { sectionId = '' } = useParams()
  const navigate = useNavigate()
  const member = useCurrentMember()
  const token = useAppStore((state) => state.authToken)
  const members = useAppStore((state) => state.members)
  const setMembers = useAppStore((state) => state.setMembers)
  const section = healthProfileSectionMap[sectionId as HealthProfileSectionId]
  const storageKey = `hoho-health-profile:${member.id}:${sectionId}`
  const storedRecords = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as FormValues[] } catch { return [] }
  }, [storageKey])
  const initialRecords = useMemo(
    () => getInitialHealthProfileRecords(sectionId as HealthProfileSectionId, storedRecords, member),
    [member, sectionId, storedRecords]
  )
  const [records, setRecords] = useState(initialRecords)
  const [editing, setEditing] = useState(() => getInitialHealthProfileSectionView(initialRecords) === 'create')
  const [values, setValues] = useState<FormValues>(() => sectionId === 'basic' ? getBasicHealthProfileValues(member) : {})
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!section) return <Navigate replace to="/health-profile" />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      if (section.id === 'basic') {
        if (!token) throw new Error('登录状态无效，请重新登录')
        const updated = await familyMemberService.update(member.id, toFamilyMemberHealthUpdate(values), token)
        setMembers(members.map((item) => item.id === updated.id ? adaptFamilyMember(updated) : item))
      }
      const next = [{ ...values, _savedAt: new Date().toISOString() }, ...records.filter((record) => record._savedAt !== 'member-health-profile')]
      localStorage.setItem(storageKey, JSON.stringify(next))
      setRecords(next)
      setValues(section.id === 'basic' ? values : {})
      setEditing(false)
      setSaved(true)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '保存失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  const cancelEditing = () => {
    if (records.length === 0) {
      navigate('/health-profile')
      return
    }
    setEditing(false)
  }

  return (
    <main className="app-shell min-h-dvh">
      <WebPageHeader fallback="/health-profile" title={section.title} />
      <div className="page-content pb-10">
        <section><Typography variant="body">{section.description}</Typography><Typography className="mt-1" variant="caption">记录对象：{member.name}</Typography></section>

        {editing ? (
          <form className="mt-5 grid gap-4 rounded-card border bg-surface p-4" onSubmit={submit}>
            <Typography variant="sectionTitle">新增记录</Typography>
            {section.fields.map((field) => <Field field={field} key={field.id} value={values[field.id] ?? false} onChange={(value) => setValues((current) => ({ ...current, [field.id]: value }))} />)}
            {error && <p className="text-sm text-danger" role="alert">{error}</p>}
            <div className="grid grid-cols-2 gap-2"><HohoButton disabled={submitting} onClick={cancelEditing} type="button" variant="secondary">取消</HohoButton><HohoButton disabled={submitting} type="submit">{submitting ? '正在保存…' : '保存记录'}</HohoButton></div>
          </form>
        ) : (
          <>
            <div className="mt-5 flex items-center justify-between"><Typography variant="sectionTitle">已有记录</Typography><HohoButton onClick={() => { setValues(section.id === 'basic' ? (records[0] ?? getBasicHealthProfileValues(member)) : {}); setEditing(true); setSaved(false) }}><Plus size={17} />{section.id === 'basic' ? '编辑记录' : '新增记录'}</HohoButton></div>
            {saved && <p className="mt-3 text-sm text-primary" role="status">记录已保存在当前设备</p>}
            <div className="mt-3 overflow-hidden rounded-card border bg-surface">{records.map((record, index) => <div className="border-b px-4 py-3 last:border-b-0" key={`${String(record._savedAt)}-${index}`}><strong className="text-sm">{section.title}记录</strong><p className="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">{section.fields.map((field) => record[field.id] ? `${field.label}：${String(record[field.id])}` : '').filter(Boolean).join(' · ')}</p></div>)}</div>
          </>
        )}
      </div>
    </main>
  )
}

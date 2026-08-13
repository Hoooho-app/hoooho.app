import { FormEvent, useMemo, useState } from 'react'
import { Paperclip, Pencil, Trash2 } from 'lucide-react'
import { Navigate, useParams } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { MemberIdentityCard } from '../../components/health'
import { HohoButton, Typography } from '../../components/design-system'
import { healthProfileSectionMap, type HealthProfileField, type HealthProfileSectionId } from '../../features/health-profile/config/healthProfileSections'
import { calculateBmi, getBasicHealthProfileValues, getInitialHealthProfileRecords, toFamilyMemberHealthUpdate } from '../../features/health-profile/utils/healthProfileBasicInfo'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'

type FormValues = Record<string, string | boolean>

function optionValue(option: string | { value: string; label: string }) { return typeof option === 'string' ? option : option.value }
function optionLabel(option: string | { value: string; label: string }) { return typeof option === 'string' ? option : option.label }

function Field({ field, value, onChange, onUnavailable }: { field: HealthProfileField; value: string | boolean; onChange: (value: string | boolean) => void; onUnavailable: () => void }) {
  if (field.type === 'computed') return <div className="hoho-field"><span className="hoho-text-label">{field.label}</span><output className="hoho-input flex items-center bg-background text-text-secondary">{String(value) || '—'}</output></div>
  if (field.type === 'attachment') return <div className="hoho-field"><span className="hoho-text-label">{field.label}</span><button className="flex min-h-11 items-center justify-center gap-2 rounded-control border border-dashed bg-surface text-sm font-medium text-primary" onClick={onUnavailable} type="button"><Paperclip size={17} />添加附件</button></div>
  if (field.type === 'textarea') return <label className="hoho-field"><span className="hoho-text-label">{field.label}</span><textarea className="hoho-textarea" placeholder={field.placeholder} rows={3} value={String(value)} onChange={(event) => onChange(event.target.value)} /></label>
  if (field.type === 'select') return <label className="hoho-field"><span className="hoho-text-label">{field.label}</span><select className="hoho-select" value={String(value)} onChange={(event) => onChange(event.target.value)}><option value="">请选择</option>{field.options?.map((option) => <option key={optionValue(option)} value={optionValue(option)}>{optionLabel(option)}</option>)}</select></label>
  if (field.type === 'checkbox') return <label className="flex min-h-12 items-center justify-between rounded-control border bg-surface px-3"><span className="hoho-text-label">{field.label}</span><input checked={Boolean(value)} type="checkbox" onChange={(event) => onChange(event.target.checked)} /></label>
  return <label className="hoho-field"><span className="hoho-text-label">{field.label}</span><span className="relative"><input className="hoho-input pr-16" placeholder={field.placeholder} type={field.type} value={String(value)} onChange={(event) => onChange(event.target.value)} />{field.unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary">{field.unit}</span>}</span></label>
}

function summarizeRecord(fields: HealthProfileField[], record: FormValues) {
  return fields.flatMap((field) => {
    if (field.type === 'attachment' || field.type === 'computed') return []
    const value = record[field.id]
    if (value == null || value === '' || value === false) return []
    const selected = field.options?.find((option) => optionValue(option) === value)
    return [`${field.label}：${selected ? optionLabel(selected) : String(value)}${field.unit ?? ''}`]
  }).slice(0, 3).join(' · ') || '尚未填写具体内容'
}

export function HealthProfileSectionPage() {
  const { sectionId = '' } = useParams()
  const member = useCurrentMember()
  const token = useAppStore((state) => state.authToken)
  const members = useAppStore((state) => state.members)
  const setMembers = useAppStore((state) => state.setMembers)
  const section = healthProfileSectionMap[sectionId as HealthProfileSectionId]
  const storageKey = `hoho-health-profile:${member.id}:${sectionId}`
  const storedRecords = useMemo(() => { try { return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as FormValues[] } catch { return [] } }, [storageKey])
  const initialRecords = useMemo(() => getInitialHealthProfileRecords(sectionId as HealthProfileSectionId, storedRecords, member), [member, sectionId, storedRecords])
  const [records, setRecords] = useState(initialRecords)
  const [values, setValues] = useState<FormValues>(() => sectionId === 'basic' ? getBasicHealthProfileValues(member, storedRecords[0]) : {})
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  if (!section) return <Navigate replace to="/health-profile" />
  const bmi = section.id === 'basic' ? calculateBmi(values.height, values.weight) : ''

  const persist = (next: FormValues[]) => { localStorage.setItem(storageKey, JSON.stringify(next)); setRecords(next) }
  const resetForm = () => { setValues(section.id === 'basic' ? getBasicHealthProfileValues(member) : {}); setEditingIndex(null) }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError(''); setStatus('')
    try {
      let savedValues = { ...values, _savedAt: new Date().toISOString() }
      if (section.id === 'basic') {
        if (!token) throw new Error('登录状态无效，请重新登录')
        const updated = await familyMemberService.update(member.id, toFamilyMemberHealthUpdate(values), token)
        setMembers(members.map((item) => item.id === updated.id ? adaptFamilyMember(updated) : item))
        savedValues = { ...getBasicHealthProfileValues(adaptFamilyMember(updated)), _savedAt: new Date().toISOString() }
        setValues(savedValues)
        persist([savedValues])
      } else if (editingIndex == null) {
        persist([savedValues, ...records])
        resetForm()
      } else {
        persist(records.map((record, index) => index === editingIndex ? savedValues : record))
        resetForm()
      }
      setStatus(section.id === 'basic' ? '基础健康信息已保存' : editingIndex == null ? '记录已添加' : '记录已更新')
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : '保存失败，请稍后重试') }
    finally { setSubmitting(false) }
  }

  const editRecord = (record: FormValues, index: number) => { setValues(record); setEditingIndex(index); setStatus(''); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) }
  const deleteRecord = (index: number) => {
    if (!window.confirm('确认删除这条健康档案记录吗？')) return
    persist(records.filter((_, recordIndex) => recordIndex !== index)); resetForm(); setStatus('记录已删除')
  }

  return <main className="app-shell min-h-dvh">
    <WebPageHeader fallback="/health-profile" title={section.title} />
    <div className="page-content pb-10">
      <MemberIdentityCard member={member} recordSubject />
      <Typography className="mt-4" variant="body">{section.guidance}</Typography>

      {section.id !== 'basic' && records.length > 0 && <section className="mt-6 grid gap-3">
        <Typography variant="sectionTitle">已有记录</Typography>
        <div className="overflow-hidden rounded-card border bg-surface">{records.map((record, index) => <article className="border-b p-4 last:border-b-0" key={`${String(record._savedAt)}-${index}`}>
          <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><strong className="text-sm">{String(record.name || record.disease || record.type || section.title)}</strong><p className="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">{summarizeRecord(section.fields, record)}</p></div>
            <button aria-label="编辑记录" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-primary" onClick={() => editRecord(record, index)} type="button"><Pencil size={17} /></button>
            <button aria-label="删除记录" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-danger" onClick={() => deleteRecord(index)} type="button"><Trash2 size={17} /></button>
          </div>
        </article>)}</div>
      </section>}

      <form className="mt-6 grid gap-5 rounded-card border bg-surface p-4" onSubmit={submit}>
        <div><Typography variant="sectionTitle">{section.id === 'basic' ? '维护档案' : editingIndex == null ? '添加记录' : '编辑记录'}</Typography><Typography className="mt-1" variant="caption">所有字段均可留空，按你了解的情况填写即可</Typography></div>
        {section.fields.map((field, index) => <div key={field.id}>{section.id === 'basic' && index === 6 && <Typography className="mb-4 mt-1" variant="sectionTitle">血型</Typography>}<Field field={field} value={field.id === 'bmi' ? bmi : (values[field.id] ?? '')} onChange={(value) => setValues((current) => ({ ...current, [field.id]: value }))} onUnavailable={() => setStatus('附件功能暂未开放')} />{field.id === 'rhBloodType' && values.rhBloodType === 'negative' && <Typography className="mt-2" variant="caption">Rh(D) 阴性，日常也常被称为“熊猫血”</Typography>}</div>)}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        {status && <p className="text-sm text-primary" role="status">{status}</p>}
        <div className={editingIndex == null || section.id === 'basic' ? '' : 'grid grid-cols-2 gap-2'}>{editingIndex != null && section.id !== 'basic' && <HohoButton disabled={submitting} onClick={resetForm} type="button" variant="secondary">取消编辑</HohoButton>}<HohoButton disabled={submitting} type="submit">{submitting ? '正在保存…' : section.id === 'basic' ? '保存档案' : editingIndex == null ? '保存记录' : '更新记录'}</HohoButton></div>
      </form>
    </div>
  </main>
}

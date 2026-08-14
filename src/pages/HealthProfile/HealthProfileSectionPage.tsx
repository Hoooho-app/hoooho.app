import { FormEvent, useMemo, useState } from 'react'
import { Paperclip, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { MedicationProfilePage } from './MedicationProfilePage'
import { AllergyProfilePage } from './AllergyProfilePage'
import { ChronicProfilePage } from './ChronicProfilePage'
import { SurgeryProfilePage } from './SurgeryProfilePage'
import { profileSectionExperienceMap } from '../../features/health-profile/config/profileSectionExperiences'
import { HealthProfileExperiencePage } from './profile-sections/HealthProfileExperiencePage'
import { ProfileChoiceGroup } from './profile-sections/ProfileSectionPatterns'

type FormValues = Record<string, string | boolean>

function optionValue(option: string | { value: string; label: string }) { return typeof option === 'string' ? option : option.value }
function optionLabel(option: string | { value: string; label: string }) { return typeof option === 'string' ? option : option.label }

function Field({ field, value, onChange, onUnavailable }: { field: HealthProfileField; value: string | boolean; onChange: (value: string | boolean) => void; onUnavailable: () => void }) {
  if (field.type === 'computed') return <div className="hoho-field"><span className="hoho-text-label">{field.label}</span><output className="hoho-input flex items-center bg-background text-text-secondary">{String(value) || '—'}</output></div>
  if (field.type === 'attachment') return <div className="hoho-field"><span className="hoho-text-label">{field.label}</span><button className="flex min-h-11 items-center justify-center gap-2 rounded-control border border-dashed bg-surface text-sm font-medium text-primary" onClick={onUnavailable} type="button"><Paperclip size={17} />添加附件</button></div>
  if (field.type === 'textarea') return <label className="hoho-field"><span className="hoho-text-label">{field.label}</span><textarea className="hoho-textarea" placeholder={field.placeholder} rows={3} value={String(value)} onChange={(event) => onChange(event.target.value)} /></label>
  if (field.type === 'select') return <label className="hoho-field"><span className="hoho-text-label">{field.label}</span><select className="hoho-select" value={String(value)} onChange={(event) => onChange(event.target.value)}><option value="">请选择</option>{field.options?.map((option) => <option key={optionValue(option)} value={optionValue(option)}>{optionLabel(option)}</option>)}</select></label>
  if (field.type === 'checkbox') return <label className="flex min-h-12 items-center justify-between rounded-control border bg-surface px-3"><span className="hoho-text-label">{field.label}</span><input checked={Boolean(value)} type="checkbox" onChange={(event) => onChange(event.target.checked)} /></label>
  return <label className="hoho-field min-w-0"><span className="hoho-text-label">{field.label}</span><span className="relative min-w-0"><input className={`hoho-input min-w-0 text-left ${field.type === 'number' ? 'hoho-number-input pr-10' : field.unit ? 'pr-10' : ''}`} inputMode={field.type === 'number' ? 'decimal' : undefined} placeholder={field.placeholder} step={field.type === 'number' ? 'any' : undefined} type={field.type} value={String(value)} onChange={(event) => onChange(event.target.value)} />{field.unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary">{field.unit}</span>}</span></label>
}

function BasicMetrics({ fields, values, bmi, onChange }: {
  fields: HealthProfileField[]
  values: FormValues
  bmi: string
  onChange: (id: string, value: string | boolean) => void
}) {
  return <div className="grid grid-cols-3 gap-2.5">{fields.map((field) => <Field
    field={field}
    key={field.id}
    onChange={(value) => onChange(field.id, value)}
    onUnavailable={() => undefined}
    value={field.id === 'bmi' ? bmi : (values[field.id] ?? '')}
  />)}</div>
}

function BasicBloodType({ values, onChange }: { values: FormValues; onChange: (id: string, value: string | boolean) => void }) {
  const [expanded, setExpanded] = useState(Boolean(values.otherBloodTypeInfo))
  return <section className="grid gap-5 border-t pt-5">
    <Typography variant="sectionTitle">血型</Typography>
    <ProfileChoiceGroup label="ABO 血型" onChange={(value) => onChange('aboBloodType', Array.isArray(value) ? value[0] ?? '' : value)} options={['A型', 'B型', 'AB型', 'O型']} value={String(values.aboBloodType ?? '').replace(/^(A|B|AB|O)$/, '$1型')} />
    <ProfileChoiceGroup label="RhD" onChange={(value) => onChange('rhBloodType', Array.isArray(value) ? value[0] ?? '' : value)} options={['阳性', '阴性']} value={values.rhBloodType === 'positive' ? '阳性' : values.rhBloodType === 'negative' ? '阴性' : ''} />
    <button className="flex min-h-11 items-center gap-2 justify-self-start text-sm font-medium text-primary" onClick={() => setExpanded((current) => !current)} type="button"><Plus className={expanded ? 'rotate-45 transition-transform' : 'transition-transform'} size={17} />{expanded ? '收起其他血型信息' : '其他血型信息'}</button>
    {expanded && <label className="hoho-field"><span className="hoho-text-label">其他已知血型 / 红细胞血型信息</span><input className="hoho-input" onChange={(event) => onChange('otherBloodTypeInfo', event.target.value)} placeholder="如有明确检查结果，可记录其他血型信息" value={String(values.otherBloodTypeInfo ?? '')} /></label>}
  </section>
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
  if (section.id === 'medication') return <MedicationProfilePage member={member} storageKey={storageKey} />
  if (section.id === 'allergy') return <AllergyProfilePage member={member} storageKey={storageKey} />
  if (section.id === 'chronic') return <ChronicProfilePage member={member} storageKey={storageKey} />
  if (section.id === 'surgery') return <SurgeryProfilePage member={member} storageKey={storageKey} />
  const experience = profileSectionExperienceMap[section.id as keyof typeof profileSectionExperienceMap]
  if (experience) return <main className="app-shell min-h-dvh"><WebPageHeader fallback="/health-profile" title={section.title} /><HealthProfileExperiencePage definition={experience} member={member} storageKey={storageKey} title={section.title} /></main>
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
        savedValues = { ...getBasicHealthProfileValues(adaptFamilyMember(updated), values), _savedAt: new Date().toISOString() }
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
    <div className="page-content pb-[calc(104px+env(safe-area-inset-bottom))]">
      <MemberIdentityCard member={member} recordSubject />

      {section.id !== 'basic' && records.length > 0 && <section className="mt-6 grid gap-3">
        <Typography variant="sectionTitle">已有记录</Typography>
        <div className="overflow-hidden rounded-card border bg-surface">{records.map((record, index) => <article className="border-b p-4 last:border-b-0" key={`${String(record._savedAt)}-${index}`}>
          <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><strong className="text-sm">{String(record.name || record.disease || record.type || section.title)}</strong><p className="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">{summarizeRecord(section.fields, record)}</p></div>
            <button aria-label="编辑记录" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-primary" onClick={() => editRecord(record, index)} type="button"><Pencil size={17} /></button>
            <button aria-label="删除记录" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-danger" onClick={() => deleteRecord(index)} type="button"><Trash2 size={17} /></button>
          </div>
        </article>)}</div>
      </section>}

      <form className="mt-6 grid gap-5 rounded-card border bg-surface p-4" id="health-profile-form" onSubmit={submit}>
        <Typography variant="caption">所有字段均可留空，按你了解的情况填写即可</Typography>
        {section.id === 'basic' && <BasicMetrics
          bmi={bmi}
          fields={section.fields.slice(0, 3)}
          onChange={(id, value) => setValues((current) => ({ ...current, [id]: value }))}
          values={values}
        />}
        {(section.id === 'basic' ? section.fields.slice(3) : section.fields).map((field) => <Field
          field={field}
          key={field.id}
          value={values[field.id] ?? ''}
          onChange={(value) => setValues((current) => ({
            ...current,
            [field.id]: value,
            ...(field.id === 'combinedBloodType' ? { _combinedBloodTypeTouched: true } : {})
          }))}
          onUnavailable={() => setStatus('附件功能暂未开放')}
        />)}
        {section.id === 'basic' && <BasicBloodType values={values} onChange={(id, value) => setValues((current) => ({
          ...current,
          [id]: id === 'aboBloodType' ? String(value).replace('型', '') : id === 'rhBloodType' ? value === '阳性' ? 'positive' : value === '阴性' ? 'negative' : '' : value,
          ...(id === 'aboBloodType' || id === 'rhBloodType' ? { _bloodTypeTouched: true } : {})
        }))} />}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        {status && <p className="text-sm text-primary" role="status">{status}</p>}
      </form>
    </div>
    <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[402px] -translate-x-1/2 border-t bg-surface px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgb(var(--hoho-color-text-primary)/0.06)]">
      <div className={editingIndex == null || section.id === 'basic' ? '' : 'grid grid-cols-2 gap-2'}>{editingIndex != null && section.id !== 'basic' && <HohoButton disabled={submitting} onClick={resetForm} type="button" variant="secondary">取消编辑</HohoButton>}<HohoButton disabled={submitting} form="health-profile-form" type="submit">{submitting ? '正在保存…' : '保存档案'}</HohoButton></div>
    </div>
  </main>
}

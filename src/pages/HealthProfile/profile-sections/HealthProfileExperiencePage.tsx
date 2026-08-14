import { FormEvent, useMemo, useState } from 'react'
import type { Member } from '../../../types'
import { MemberIdentityCard } from '../../../components/health'
import { HealthCard, HohoButton, Typography } from '../../../components/design-system'
import type { ProfileExperienceDefinition, ProfileExperienceField, ProfileValues, ProfileValue } from '../../../features/health-profile/config/profileSectionExperiences'
import { deriveProfileSummary, getCurrentProfileValue, normalizeLegacyProfile, normalizeProfileValues, saveCurrentProfile, shouldShowProfileField, sortProfileRecords } from '../../../features/health-profile/utils/profileSectionExperience'
import { AddRecordButton, EditorHeader, FileField, ProfileChoiceGroup, ProfileRecordList, ProfileSectionLead, ProfileStatusMatrix, ProfileTagsField, ProfileTimeline, UploadReportAction } from './ProfileSectionPatterns'

function loadRecords(storageKey: string, sectionId: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((record) => normalizeLegacyProfile(sectionId, normalizeProfileValues(record)))
  } catch { return [] }
}

function ProfileField({ field, onChange, onUnavailable, value }: { field: ProfileExperienceField; onChange: (value: ProfileValue) => void; onUnavailable: () => void; value: ProfileValue | undefined }) {
  if (field.kind === 'single' || field.kind === 'multi') return <ProfileChoiceGroup label={field.label} multiple={field.kind === 'multi'} onChange={onChange} options={field.options ?? []} value={value} />
  if (field.kind === 'tags') return <ProfileTagsField label={field.label} onChange={onChange} placeholder={field.placeholder} value={value} />
  if (field.kind === 'attachment') return <FileField field={field} onUnavailable={onUnavailable} />
  if (field.kind === 'textarea') return <label className="hoho-field"><span className="hoho-text-label">{field.label}</span><textarea className="hoho-textarea" onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} rows={3} value={String(value ?? '')} /></label>
  return <label className="hoho-field min-w-0"><span className="hoho-text-label">{field.label}</span><span className="relative min-w-0"><input className="hoho-input w-full min-w-0 pr-14" onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} type={field.kind} value={String(value ?? '')} />{field.unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary">{field.unit}</span>}</span></label>
}

function ProfileHero({ definition, records, values }: { definition: ProfileExperienceDefinition; records: ProfileValues[]; values: ProfileValues }) {
  const summary = deriveProfileSummary(definition.id, values)
  if (definition.id === 'sleep') return <HealthCard className="grid gap-3"><Typography variant="sectionTitle">典型睡眠</Typography><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center"><strong>{String(values.bedtime || '—')}</strong><span className="h-px bg-primary/40" /><strong>{String(values.wakeTime || '—')}</strong></div><p className="text-center text-sm font-medium text-primary">{summary}</p></HealthCard>
  if (definition.id === 'menstrual') return <HealthCard><Typography variant="sectionTitle">典型周期</Typography><p className="mt-2 text-sm text-text-secondary">{summary || '填写周期和经期时长后形成长期周期画像'}</p></HealthCard>
  if (definition.id === 'birth' && summary) return <p className="rounded-control bg-primary-soft px-3 py-2 text-sm text-primary">{summary}</p>
  if (definition.id === 'growth' && records.length > 0) { const latest = sortProfileRecords(records)[0]; return <HealthCard><Typography variant="sectionTitle">当前</Typography><div className="mt-3 grid grid-cols-2 gap-3"><div><strong className="text-xl">{String(latest.height || '—')} cm</strong><p className="text-xs text-text-secondary">最近身高</p></div><div><strong className="text-xl">{String(latest.weight || '—')} kg</strong><p className="text-xs text-text-secondary">最近体重</p></div></div></HealthCard> }
  if (definition.id === 'smoking' && summary) return <p className="text-sm font-medium text-primary">{summary}</p>
  return null
}

function fieldGroups(fields: ProfileExperienceField[], values: ProfileValues) {
  const visible = fields.filter((field) => shouldShowProfileField(field, values))
  return visible.reduce<Array<{ title: string; fields: ProfileExperienceField[] }>>((groups, field) => {
    const title = field.group ?? '档案内容'
    const group = groups.find((item) => item.title === title)
    if (group) group.fields.push(field); else groups.push({ title, fields: [field] })
    return groups
  }, [])
}

export function HealthProfileExperiencePage({ definition, member, storageKey, title }: { definition: ProfileExperienceDefinition; member: Member; storageKey: string; title: string }) {
  const [records, setRecords] = useState<ProfileValues[]>(() => {
    const loaded = loadRecords(storageKey, definition.id)
    return definition.mode === 'timeline' ? sortProfileRecords(loaded) : loaded
  })
  const [values, setValues] = useState<ProfileValues>(() => definition.repeatable ? {} : getCurrentProfileValue(loadRecords(storageKey, definition.id)))
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editorOpen, setEditorOpen] = useState(!definition.repeatable)
  const [status, setStatus] = useState('')
  const displayedRecords = useMemo(() => records, [records])
  const groups = useMemo(() => fieldGroups(definition.fields, values), [definition.fields, values])
  const matrixFields = definition.id === 'mobility' ? definition.fields.filter((field) => field.group === '日常生活能力') : []

  const change = (id: string, value: ProfileValue) => setValues((current) => ({ ...current, [id]: value }))
  const persist = (next: ProfileValues[]) => {
    const ordered = definition.mode === 'timeline' ? sortProfileRecords(next) : next
    localStorage.setItem(storageKey, JSON.stringify(ordered)); setRecords(ordered)
  }
  const closeEditor = () => { setValues({}); setEditingIndex(null); setEditorOpen(false); setStatus('') }
  const openNew = () => { setValues({}); setEditingIndex(null); setEditorOpen(true); setStatus(''); window.setTimeout(() => document.getElementById('profile-experience-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0) }
  const edit = (record: ProfileValues, index: number) => { setValues(record); setEditingIndex(index); setEditorOpen(true); setStatus(''); window.setTimeout(() => document.getElementById('profile-experience-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0) }
  const remove = (index: number) => { if (!window.confirm('确认删除这条健康档案记录吗？')) return; persist(records.filter((_, itemIndex) => itemIndex !== index)); if (editingIndex === index) closeEditor(); setStatus('记录已删除') }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const saved = { ...values, _savedAt: new Date().toISOString() }
    if (!definition.repeatable) {
      const next = saveCurrentProfile(saved, records)
      persist(next); setValues(next[0]); setStatus('档案已保存'); return
    }
    const next = editingIndex == null ? [saved, ...records] : records.map((record, index) => index === editingIndex ? saved : record)
    persist(next); closeEditor(); setStatus(editingIndex == null ? '记录已添加' : '记录已更新')
  }

  return <>
    <div className="page-content pb-[calc(104px+env(safe-area-inset-bottom))]">
      <MemberIdentityCard member={member} recordSubject />
      <ProfileHero definition={definition} records={displayedRecords} values={values} />
      {definition.id === 'examination' && <UploadReportAction onUnavailable={() => setStatus('附件功能暂未开放，可先手动添加报告摘要')} />}
      {definition.repeatable && <ProfileRecordList emptyDescription={definition.emptyDescription ?? '需要时再添加即可。'} emptyTitle={definition.emptyTitle ?? '暂无记录'} mode={definition.mode} onDelete={remove} onEdit={edit} records={displayedRecords} title={title} />}
      {definition.mode === 'timeline' && <ProfileTimeline records={displayedRecords} />}
      {definition.repeatable && !editorOpen && <AddRecordButton onClick={openNew}>{definition.addLabel ?? '添加一条记录'}</AddRecordButton>}
      {editorOpen && <form className="grid gap-6 rounded-card border bg-surface p-4" id="health-profile-experience-form" onSubmit={submit}>
        <div id="profile-experience-editor"><EditorHeader onClose={definition.repeatable ? closeEditor : undefined} title={definition.repeatable ? (editingIndex == null ? definition.addLabel ?? '新增记录' : '编辑记录') : '所有字段均可留空'} /></div>
        {!definition.repeatable && <p className="text-xs leading-5 text-text-secondary">按你了解的情况填写即可，留空表示未提供。</p>}
        {groups.map((group) => {
          const fields = group.fields.filter((field) => !matrixFields.includes(field))
          if (group.title === '日常生活能力' && matrixFields.length > 0) return <ProfileSectionLead key={group.title} title={group.title}><ProfileStatusMatrix fields={matrixFields} onChange={change} values={values} /></ProfileSectionLead>
          if (fields.length === 0) return null
          return <ProfileSectionLead key={group.title} title={group.title}><div className={fields.every((field) => field.kind === 'number' || field.kind === 'date' || field.kind === 'time') ? 'grid grid-cols-2 gap-3' : 'grid gap-4'}>{fields.map((field) => <ProfileField field={field} key={field.id} onChange={(value) => change(field.id, value)} onUnavailable={() => setStatus('附件功能暂未开放')} value={values[field.id]} />)}</div></ProfileSectionLead>
        })}
        {definition.id === 'feeding' && <p className="text-xs leading-5 text-text-secondary">如需长期记录食物异常反应，请前往「过敏与不良反应」补充。</p>}
        {definition.id === 'fall' && <p className="text-xs leading-5 text-text-secondary">受伤部位暂使用文字记录；身体部位定位器将在单独授权后接入。</p>}
        {status && <p className="text-sm text-primary" role="status">{status}</p>}
      </form>}
      {!editorOpen && status && <p className="text-center text-sm text-primary" role="status">{status}</p>}
    </div>
    {editorOpen && <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[402px] -translate-x-1/2 border-t bg-surface px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgb(var(--hoho-color-text-primary)/0.06)]"><div className={definition.repeatable ? 'grid grid-cols-2 gap-2' : ''}>{definition.repeatable && <HohoButton onClick={closeEditor} variant="secondary">取消</HohoButton>}<HohoButton form="health-profile-experience-form" type="submit">{definition.repeatable ? editingIndex == null ? '保存记录' : '保存修改' : '保存档案'}</HohoButton></div></div>}
  </>
}

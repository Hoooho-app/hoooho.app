import { FormEvent, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { WebPageHeader } from '../../components/common'
import { HealthProfileActionBar, MemberIdentityCard } from '../../components/health'
import { HohoButton, Typography } from '../../components/design-system'
import {
  allergyReactionSummary,
  emptyAllergyRecord,
  nextAllergySequence,
  normalizeAllergyRecords,
  type AllergyProfileRecord
} from '../../features/health-profile/utils/allergyProfile'
import type { Member } from '../../types'

const reactionCategories = ['皮肤', '消化道', '呼吸道', '全身']

function loadRecords(storageKey: string) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(value) ? normalizeAllergyRecords(value) : []
  } catch {
    return []
  }
}

function SequenceNumber({ sequence }: { sequence: number }) {
  return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-surface">{sequence}</span>
}

function ChoiceGroup({ label, options, value, columns = 2, onChange }: { label: string; options: string[]; value: string; columns?: 2 | 3; onChange: (value: string) => void }) {
  return <fieldset className="grid gap-2"><legend className="hoho-text-label mb-2">{label}</legend><div className={`grid gap-2 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>{options.map((option) => <button aria-pressed={value === option} className={`min-h-11 rounded-control border px-2 text-sm ${value === option ? 'border-primary bg-primary text-surface' : 'bg-surface text-text-primary'}`} key={option} onClick={() => onChange(value === option ? '' : option)} type="button">{option}</button>)}</div></fieldset>
}

function ReactionSelector({ record, onChange }: { record: AllergyProfileRecord; onChange: (changes: Partial<AllergyProfileRecord>) => void }) {
  const [showOther, setShowOther] = useState(Boolean(record.otherReaction))
  const toggle = (reaction: string) => onChange({ reactions: record.reactions.includes(reaction) ? record.reactions.filter((item) => item !== reaction) : [...record.reactions, reaction] })

  return <fieldset className="grid gap-3">
    <legend className="hoho-text-label mb-2">出现过的反应</legend>
    <div className="flex flex-wrap gap-2">
      {reactionCategories.map((reaction) => {
        const selected = record.reactions.includes(reaction)
        return <button aria-pressed={selected} className={`inline-flex min-h-11 items-center gap-1.5 rounded-control border px-3 text-sm ${selected ? 'border-primary bg-primary-soft font-semibold text-primary' : 'bg-surface text-text-secondary'}`} key={reaction} onClick={() => toggle(reaction)} type="button">{selected && <Check size={14} />}{reaction}</button>
      })}
      <button aria-expanded={showOther} className="min-h-11 rounded-control border bg-surface px-3 text-sm text-primary" onClick={() => setShowOther((current) => !current)} type="button">+ 其他表现</button>
    </div>
    {record.reactions.length > 0 && <label className="hoho-field"><span className="hoho-text-label">补充具体表现（选填）</span><input className="hoho-input" placeholder="例如皮疹、腹泻、喘息" value={record.reactionDetail} onChange={(event) => onChange({ reactionDetail: event.target.value })} /></label>}
    {showOther && <label className="hoho-field"><span className="hoho-text-label">其他表现</span><input autoFocus className="hoho-input" value={record.otherReaction} onChange={(event) => onChange({ otherReaction: event.target.value })} /></label>}
  </fieldset>
}

function AllergyFields({ record, onChange }: { record: AllergyProfileRecord; onChange: (changes: Partial<AllergyProfileRecord>) => void }) {
  return <div className="grid gap-5">
    <ChoiceGroup label="明确程度" options={['已明确', '怀疑中']} value={record.certainty} onChange={(certainty) => onChange({ certainty })} />
    <label className="hoho-field"><span className="hoho-text-label">对什么过敏 / 怀疑什么</span><input className="hoho-input" placeholder="例如猫毛、花粉、青霉素、牛奶" value={record.subject} onChange={(event) => onChange({ subject: event.target.value })} /></label>
    <ReactionSelector record={record} onChange={onChange} />
    <ChoiceGroup columns={3} label="影响程度" options={['轻微', '明显', '严重']} value={record.impact} onChange={(impact) => onChange({ impact })} />
    <label className="hoho-field"><span className="hoho-text-label">平时如何处理</span><textarea className="hoho-textarea" placeholder="记录过去实际如何处理" rows={3} value={record.handling} onChange={(event) => onChange({ handling: event.target.value })} /></label>
  </div>
}

export function AllergyProfilePage({ member, storageKey }: { member: Member; storageKey: string }) {
  const initial = useState(() => loadRecords(storageKey))[0]
  const [records, setRecords] = useState<AllergyProfileRecord[]>(() => initial.length ? initial : [emptyAllergyRecord(1)])
  const [expandedId, setExpandedId] = useState(() => initial.length ? '' : records[0].id)
  const [status, setStatus] = useState('')

  const updateRecord = (id: string, changes: Partial<AllergyProfileRecord>) => setRecords((current) => current.map((record) => record.id === id ? { ...record, ...changes } : record))
  const addRecord = () => {
    const next = emptyAllergyRecord(nextAllergySequence(records))
    setRecords((current) => [...current, next])
    setExpandedId(next.id)
    setStatus('')
  }
  const deleteRecord = (id: string) => {
    if (!window.confirm('确认删除这条过敏 / 不良反应记录吗？')) return
    setRecords((current) => {
      const next = current.filter((record) => record.id !== id)
      if (!next.length) {
        const empty = emptyAllergyRecord(1)
        setExpandedId(empty.id)
        return [empty]
      }
      if (expandedId === id) setExpandedId('')
      return next
    })
  }
  const saveArchive = (event: FormEvent) => {
    event.preventDefault()
    try {
      const savedAt = new Date().toISOString()
      const next = records.map((record) => ({ ...record, _savedAt: savedAt }))
      localStorage.setItem(storageKey, JSON.stringify(next))
      setRecords(next)
      setStatus('过敏与不良反应档案已保存')
    } catch {
      setStatus('保存失败，请稍后重试')
    }
  }

  return <main className="app-shell health-profile-detail-shell">
    <WebPageHeader fallback="/health-profile" title="过敏与不良反应" />
    <div className="page-content health-profile-page-content">
      <MemberIdentityCard member={member} recordSubject />
      <Typography variant="caption">所有字段均可留空，按你了解的情况填写即可</Typography>
      <form className="grid gap-3" id="allergy-profile-form" onSubmit={saveArchive}>
        {records.map((record) => {
          const expanded = expandedId === record.id
          const reactionSummary = allergyReactionSummary(record)
          const summary = [record.certainty, reactionSummary, record.impact].filter(Boolean).join(' · ')
          return <article className="rounded-card border bg-surface p-4" key={record.id}>
            <div className="flex items-start gap-3">
              <SequenceNumber sequence={record.sequence} />
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-sm">{record.subject || `过敏 / 反应 ${record.sequence}`}</strong>
                {!expanded && <span className="mt-1 block line-clamp-2 text-xs leading-5 text-text-secondary">{summary || '尚未填写'}</span>}
              </div>
              {!expanded && <button className="min-h-11 px-1 text-sm font-medium text-primary" onClick={() => setExpandedId(record.id)} type="button">编辑</button>}
              <button className="min-h-11 px-1 text-sm font-medium text-danger" onClick={() => deleteRecord(record.id)} type="button">删除</button>
            </div>
            {expanded && <div className="mt-5 grid gap-5"><AllergyFields record={record} onChange={(changes) => updateRecord(record.id, changes)} /><HohoButton fullWidth onClick={() => setExpandedId('')} type="button" variant="secondary"><Check size={17} />确认并收起</HohoButton></div>}
          </article>
        })}
        <button className="flex min-h-12 items-center justify-center gap-2 rounded-control border border-dashed text-sm font-semibold text-primary" onClick={addRecord} type="button"><Plus size={19} />添加过敏 / 不良反应</button>
        {status && <p className={`text-sm ${status.includes('失败') ? 'text-danger' : 'text-primary'}`} role="status">{status}</p>}
      </form>
    </div>
    <HealthProfileActionBar><HohoButton fullWidth form="allergy-profile-form" type="submit">保存档案</HohoButton></HealthProfileActionBar>
  </main>
}

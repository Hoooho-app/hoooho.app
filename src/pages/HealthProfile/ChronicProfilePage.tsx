import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { WebPageHeader } from '../../components/common'
import {
  BodyLocationPicker,
  HealthProfileActionBar,
  MemberIdentityCard,
  SmartTagInput
} from '../../components/health'
import { HohoButton, Typography } from '../../components/design-system'
import {
  chronicSummary,
  emptyChronicRecord,
  nextChronicSequence,
  normalizeChronicRecords,
  type ChronicProfileRecord
} from '../../features/health-profile/utils/chronicProfile'
import type { Member } from '../../types'

const MANIFESTATION_SUGGESTIONS = ['疼痛', '酸胀', '麻木', '刺痛', '灼热', '僵硬', '无力', '肿胀']
const FREQUENCIES = ['每天', '每周', '每月', '每季度', '每年', '没有固定频率']
const DURATIONS = ['几分钟', '几十分钟', '几小时', '半天左右', '一天左右', '数天', '其他']
const TRIGGER_SUGGESTIONS = ['久站', '久坐', '运动后', '劳累后', '睡眠不足', '受凉', '压力大', '饮食后', '早晨', '晚上', '天气变化']
const IMPACT_SUGGESTIONS = ['基本不影响', '影响走路', '影响睡眠', '影响工作', '影响运动', '影响进食', '影响开车', '影响弯腰', '影响抬手', '需要休息']

function loadJson(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as unknown
  } catch {
    return []
  }
}

function SequenceNumber({ sequence }: { sequence: number }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-surface">
      {sequence}
    </span>
  )
}

function ChoiceGroup({
  label,
  options,
  value,
  onChange
}: {
  label: string
  options: readonly string[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="hoho-text-label mb-1">{label}</legend>
      <div className="flex min-w-0 flex-wrap gap-2">
        {options.map((option) => (
          <button
            aria-pressed={value === option}
            className={`min-h-11 rounded-control border px-3 text-xs ${value === option ? 'border-primary bg-primary-soft font-semibold text-primary' : 'bg-surface text-text-secondary'}`}
            key={option}
            onClick={() => onChange(value === option ? '' : option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function ChronicFields({
  member,
  record,
  onChange
}: {
  member: Member
  record: ChronicProfileRecord
  onChange: (changes: Partial<ChronicProfileRecord>) => void
}) {
  const titleLabel = record.knowledge === '还不知道是什么' ? '怎么称呼这个问题' : '疾病 / 问题名称'

  return (
    <div className="grid min-w-0 gap-5">
      <ChoiceGroup
        label="我对这个问题的了解"
        options={['已有明确名称', '还不知道是什么']}
        value={record.knowledge}
        onChange={(knowledge) => onChange({ knowledge })}
      />
      <label className="hoho-field min-w-0">
        <span className="hoho-text-label">{titleLabel}</span>
        <input
          className="hoho-input min-w-0"
          placeholder={record.knowledge === '还不知道是什么' ? '例如冬天反复头疼' : '例如哮喘、高血压'}
          value={record.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </label>
      <div className="grid min-w-0 gap-2">
        <BodyLocationPicker
          label="不舒服的位置"
          member={member}
          value={record.bodyLocations}
          onChange={(bodyLocations) => onChange({ bodyLocations })}
        />
        {record.legacyLocationNotes.length > 0 && (
          <p className="text-xs leading-5 text-text-secondary">
            旧记录位置：{record.legacyLocationNotes.join('、')}
          </p>
        )}
      </div>
      <SmartTagInput
        label="主要表现"
        maxTags={12}
        placeholder="输入表现后按回车添加"
        suggestions={MANIFESTATION_SUGGESTIONS}
        value={record.manifestations}
        onChange={(manifestations) => onChange({ manifestations })}
      />
      <ChoiceGroup
        label="出现频率"
        options={FREQUENCIES}
        value={record.frequency}
        onChange={(frequency) => onChange({ frequency })}
      />
      <ChoiceGroup
        label="每次通常持续"
        options={DURATIONS}
        value={record.duration}
        onChange={(duration) => onChange({ duration, customDuration: duration === '其他' ? record.customDuration : '' })}
      />
      {record.duration === '其他' && (
        <label className="hoho-field min-w-0">
          <span className="hoho-text-label">其他持续时间</span>
          <input
            className="hoho-input min-w-0"
            placeholder="例如两周左右"
            value={record.customDuration}
            onChange={(event) => onChange({ customDuration: event.target.value })}
          />
        </label>
      )}
      <div className="grid min-w-0 gap-2">
        <SmartTagInput
          label="通常在什么时候出现"
          maxTags={12}
          placeholder="输入触发情况后按回车添加"
          suggestions={TRIGGER_SUGGESTIONS}
          value={record.triggers}
          onChange={(triggers) => onChange({ triggers })}
        />
        {record.legacy?.patternNote && (
          <p className="text-xs leading-5 text-text-secondary">旧规律备注：{record.legacy.patternNote}</p>
        )}
      </div>
      <SmartTagInput
        exclusiveValue="基本不影响"
        label="对生活的影响"
        maxTags={10}
        placeholder="输入实际影响后按回车添加"
        suggestions={IMPACT_SUGGESTIONS}
        value={record.lifeImpacts}
        onChange={(lifeImpacts) => onChange({ lifeImpacts })}
      />
      <label className="hoho-field min-w-0">
        <span className="hoho-text-label">平时怎么处理</span>
        <textarea
          className="hoho-textarea min-w-0"
          placeholder="例如休息、热敷、贴膏药、服药或做过理疗等"
          rows={3}
          value={record.handling}
          onChange={(event) => onChange({ handling: event.target.value })}
        />
      </label>
    </div>
  )
}

export function ChronicProfilePage({ member, storageKey }: { member: Member; storageKey: string }) {
  const initial = useState(() => {
    const stored = loadJson(storageKey)
    return normalizeChronicRecords(Array.isArray(stored) ? stored as Record<string, unknown>[] : [])
  })[0]
  const [records, setRecords] = useState<ChronicProfileRecord[]>(() => initial.length ? initial : [emptyChronicRecord(1)])
  const [expandedId, setExpandedId] = useState(() => initial.length ? '' : records[0].id)
  const [status, setStatus] = useState('')

  const updateRecord = (id: string, changes: Partial<ChronicProfileRecord>) => {
    setRecords((current) => current.map((record) => record.id === id ? { ...record, ...changes } : record))
  }

  const addRecord = () => {
    const next = emptyChronicRecord(nextChronicSequence(records))
    setRecords((current) => [...current, next])
    setExpandedId(next.id)
    setStatus('')
  }

  const deleteRecord = (id: string) => {
    if (!window.confirm('确认删除这条长期健康问题记录吗？')) return
    if (records.length === 1) {
      const empty = emptyChronicRecord(1)
      setRecords([empty])
      setExpandedId(empty.id)
    } else {
      setRecords((current) => current.filter((record) => record.id !== id))
      setExpandedId('')
    }
  }

  const saveArchive = (event: FormEvent) => {
    event.preventDefault()
    try {
      const savedAt = new Date().toISOString()
      const next = records.map((record) => ({ ...record, _savedAt: savedAt }))
      localStorage.setItem(storageKey, JSON.stringify(next))
      setRecords(next)
      setExpandedId('')
      setStatus('慢性病史档案已保存')
    } catch {
      setStatus('保存失败，请稍后重试')
    }
  }

  return (
    <main className="app-shell min-h-dvh">
      <WebPageHeader fallback="/health-profile" title="慢性病史" />
      <div className="page-content health-profile-page-content">
        <MemberIdentityCard member={member} recordSubject />
        <Typography variant="caption">所有字段均可留空，按你了解的情况填写即可</Typography>
        <form className="grid gap-3" id="chronic-profile-form" onSubmit={saveArchive}>
          {records.map((record) => {
            const expanded = expandedId === record.id
            const summary = chronicSummary(record)

            return (
              <article className="min-w-0 rounded-card border bg-surface p-4" key={record.id}>
                <div className="flex min-w-0 items-start gap-3">
                  <SequenceNumber sequence={record.sequence} />
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{record.name || `长期健康问题 ${record.sequence}`}</strong>
                    {!expanded && (
                      <div className="mt-1 grid gap-0.5 text-xs leading-5 text-text-secondary">
                        <span className="line-clamp-1">{summary.locations}</span>
                        <span className="line-clamp-1">{summary.manifestations}</span>
                        <span className="line-clamp-1">{summary.rhythm}</span>
                      </div>
                    )}
                  </div>
                  {!expanded && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-medium text-primary"
                        onClick={() => setExpandedId(record.id)}
                        type="button"
                      >
                        <Pencil size={14} />编辑
                      </button>
                      <button
                        className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-medium text-danger"
                        onClick={() => deleteRecord(record.id)}
                        type="button"
                      >
                        <Trash2 size={14} />删除
                      </button>
                    </div>
                  )}
                </div>
                {expanded && (
                  <div className="mt-5 grid min-w-0 gap-5">
                    <ChronicFields
                      member={member}
                      record={record}
                      onChange={(changes) => updateRecord(record.id, changes)}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                      <button
                        className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-medium text-danger"
                        onClick={() => deleteRecord(record.id)}
                        type="button"
                      >
                        <Trash2 size={16} />删除这条记录
                      </button>
                      <HohoButton onClick={() => setExpandedId('')} type="button" variant="secondary">
                        <Check size={17} />确认并收起
                      </HohoButton>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
          <button
            className="flex min-h-12 items-center justify-center gap-2 rounded-control border border-dashed text-sm font-semibold text-primary"
            onClick={addRecord}
            type="button"
          >
            <Plus size={19} />添加一个长期健康问题
          </button>
          {status && (
            <p className={`text-sm ${status.includes('失败') ? 'text-danger' : 'text-primary'}`} role="status">
              {status}
            </p>
          )}
        </form>
      </div>
      <HealthProfileActionBar>
        <HohoButton fullWidth form="chronic-profile-form" type="submit">保存档案</HohoButton>
      </HealthProfileActionBar>
    </main>
  )
}

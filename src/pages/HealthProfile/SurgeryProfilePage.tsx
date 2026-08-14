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
  emptySurgeryRecord,
  nextSurgerySequence,
  normalizeSurgeryRecords,
  surgerySummary,
  type SurgeryProfileRecord
} from '../../features/health-profile/utils/surgeryProfile'
import type { Member } from '../../types'

const POSTOPERATIVE_SUGGESTIONS = ['恢复良好', '仍有影响', '长期影响', '反复不适', '活动受限', '需要持续复查']
const IMPLANT_SUGGESTIONS = ['无', '钢板', '螺钉', '人工关节', '支架', '起搏器', '其他']

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

function SurgeryFields({
  member,
  record,
  onChange
}: {
  member: Member
  record: SurgeryProfileRecord
  onChange: (changes: Partial<SurgeryProfileRecord>) => void
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <label className="hoho-field min-w-0">
        <span className="hoho-text-label">手术名称</span>
        <input
          className="hoho-input min-w-0"
          placeholder="正式名称或日常叫法均可"
          value={record.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </label>
      <div className="grid min-w-0 gap-3 min-[390px]:grid-cols-2">
        <label className="hoho-field min-w-0">
          <span className="hoho-text-label">手术时间</span>
          <input
            className="hoho-input min-w-0 px-2"
            type="date"
            value={record.date}
            onChange={(event) => onChange({ date: event.target.value })}
          />
        </label>
        <label className="hoho-field min-w-0">
          <span className="hoho-text-label">医院 / 医疗机构</span>
          <input
            className="hoho-input min-w-0"
            value={record.hospital}
            onChange={(event) => onChange({ hospital: event.target.value })}
          />
        </label>
      </div>
      <BodyLocationPicker
        label="手术部位"
        member={member}
        onChange={(locations) => onChange({ locations })}
        value={record.locations}
      />
      <SmartTagInput
        label="术后情况"
        maxTags={12}
        placeholder="输入术后情况后按回车添加"
        suggestions={POSTOPERATIVE_SUGGESTIONS}
        value={record.postoperativeStatusTags}
        onChange={(postoperativeStatusTags) => onChange({ postoperativeStatusTags })}
      />
      <SmartTagInput
        exclusiveValue="无"
        label="植入物 / 医疗器械"
        maxTags={12}
        placeholder="输入器械名称后按回车添加"
        suggestions={IMPLANT_SUGGESTIONS}
        value={record.implantTags}
        onChange={(implantTags) => onChange({ implantTags })}
      />
      {record.legacyImplantNote && record.implantTags.length === 0 && (
        <p className="text-xs leading-5 text-text-secondary">旧记录：{record.legacyImplantNote}</p>
      )}
    </div>
  )
}

export function SurgeryProfilePage({ member, storageKey }: { member: Member; storageKey: string }) {
  const initial = useState(() => {
    const stored = loadJson(storageKey)
    return normalizeSurgeryRecords(Array.isArray(stored) ? stored as Record<string, unknown>[] : [])
  })[0]
  const [records, setRecords] = useState<SurgeryProfileRecord[]>(() => initial.length ? initial : [emptySurgeryRecord(1)])
  const [expandedId, setExpandedId] = useState(() => initial.length ? '' : records[0].id)
  const [status, setStatus] = useState('')

  const updateRecord = (id: string, changes: Partial<SurgeryProfileRecord>) => {
    setRecords((current) => current.map((record) => record.id === id ? { ...record, ...changes } : record))
  }

  const addRecord = () => {
    const next = emptySurgeryRecord(nextSurgerySequence(records))
    setRecords((current) => [...current, next])
    setExpandedId(next.id)
    setStatus('')
  }

  const deleteRecord = (id: string) => {
    if (!window.confirm('确认删除这条手术记录吗？')) return
    if (records.length === 1) {
      const empty = emptySurgeryRecord(1)
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
      setStatus('手术史档案已保存')
    } catch {
      setStatus('保存失败，请稍后重试')
    }
  }

  return (
    <main className="app-shell health-profile-detail-shell">
      <WebPageHeader fallback="/health-profile" title="手术史" />
      <div className="page-content health-profile-page-content">
        <MemberIdentityCard member={member} recordSubject />
        <Typography variant="caption">所有字段均可留空，按你了解的情况填写即可</Typography>
        <form className="grid min-w-0 gap-3" id="surgery-profile-form" onSubmit={saveArchive}>
          {records.map((record) => {
            const expanded = expandedId === record.id
            const summary = surgerySummary(record)

            return (
              <article className="min-w-0 rounded-card border bg-surface p-4" key={record.id}>
                <div className="flex min-w-0 items-start gap-3">
                  <SequenceNumber sequence={record.sequence} />
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{record.name || `手术 ${record.sequence}`}</strong>
                    {!expanded && (
                      <div className="mt-1 grid gap-0.5 text-xs leading-5 text-text-secondary">
                        <span className="line-clamp-1">{summary.context}</span>
                        <span className="line-clamp-1">{summary.locations}</span>
                        <span className="line-clamp-1">{summary.postoperative} · {summary.implant}</span>
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
                    <SurgeryFields
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
            <Plus size={19} />添加一次手术
          </button>
          {status && (
            <p className={`text-sm ${status.includes('失败') ? 'text-danger' : 'text-primary'}`} role="status">
              {status}
            </p>
          )}
        </form>
      </div>
      <HealthProfileActionBar>
        <HohoButton fullWidth form="surgery-profile-form" type="submit">保存档案</HohoButton>
      </HealthProfileActionBar>
    </main>
  )
}

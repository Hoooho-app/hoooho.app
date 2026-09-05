import { ChevronRight, Plus, Trash2 } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { WebPageHeader } from '../../components/common'
import { HealthProfileActionBar, MemberIdentityCard, SmartTagInput } from '../../components/health'
import { HohoButton, Typography } from '../../components/design-system'
import {
  emptyFamilyHistoryRecord,
  familyHistorySummary,
  findExistingUniqueRelationship,
  nextFamilyHistorySequence,
  normalizeFamilyHistoryRecords,
  setFamilyHealthIssueNames,
  type FamilyHistoryRecord
} from '../../features/health-profile/utils/familyHistoryProfile'
import { ProfileChoiceGroup } from './profile-sections/ProfileSectionPatterns'
import type { Member } from '../../types'

const RELATIONSHIPS = ['父亲', '母亲', '兄弟姐妹', '子女', '祖父', '祖母', '外祖父', '外祖母', '其他']
const ISSUE_SUGGESTIONS = ['高血压', '糖尿病', '冠心病', '脑卒中', '肿瘤', '遗传性疾病', '精神心理问题']

function loadRecords(storageKey: string) {
  try {
    const stored = JSON.parse(readProfileSection(storageKey)) as unknown
    return normalizeFamilyHistoryRecords(Array.isArray(stored) ? stored as Record<string, unknown>[] : [])
  } catch {
    return []
  }
}

function relativeTitle(record: FamilyHistoryRecord, records: readonly FamilyHistoryRecord[]) {
  const summary = familyHistorySummary(record)
  if (!['兄弟姐妹', '子女'].includes(record.relationship)) return summary.relationship
  const sameRelationship = records.filter((item) => item.relationship === record.relationship)
  if (sameRelationship.length < 2) return summary.relationship
  return `${summary.relationship} ${sameRelationship.findIndex((item) => item.id === record.id) + 1}`
}

function RelativeEditor({
  record,
  records,
  editingIndex,
  onChange,
  onSelectExisting,
  onDuplicate
}: {
  record: FamilyHistoryRecord
  records: readonly FamilyHistoryRecord[]
  editingIndex: number | null
  onChange: (record: FamilyHistoryRecord) => void
  onSelectExisting: (record: FamilyHistoryRecord, index: number) => void
  onDuplicate: () => void
}) {
  const selectRelationship = (value: string | string[]) => {
    const relationship = Array.isArray(value) ? value[0] ?? '' : value
    const existingIndex = findExistingUniqueRelationship(records, relationship)
    if (existingIndex >= 0 && existingIndex !== editingIndex) {
      if (editingIndex == null) onSelectExisting(records[existingIndex], existingIndex)
      else onDuplicate()
      return
    }
    onChange({ ...record, relationship, customRelationship: relationship === '其他' ? record.customRelationship : '' })
  }

  const updateIssue = (id: string, changes: Partial<FamilyHistoryRecord['healthIssues'][number]>) => {
    onChange({
      ...record,
      healthIssues: record.healthIssues.map((issue) => issue.id === id ? { ...issue, ...changes } : issue)
    })
  }

  return (
    <div className="grid min-w-0 gap-5">
      <ProfileChoiceGroup
        label="亲属"
        onChange={selectRelationship}
        options={RELATIONSHIPS}
        value={record.relationship}
      />
      {record.relationship === '其他' && (
        <label className="hoho-field min-w-0">
          <span className="hoho-text-label">关系名称</span>
          <input
            className="hoho-input min-w-0"
            placeholder="例如姑姑、舅舅"
            value={record.customRelationship}
            onChange={(event) => onChange({ ...record, customRelationship: event.target.value })}
          />
        </label>
      )}
      <SmartTagInput
        label="健康问题"
        maxTags={16}
        placeholder="继续输入健康问题"
        suggestions={ISSUE_SUGGESTIONS}
        value={record.healthIssues.map((issue) => issue.name)}
        onChange={(names) => onChange(setFamilyHealthIssueNames(record, names))}
      />
      {record.healthIssues.length > 0 && (
        <div className="grid gap-5">
          {record.healthIssues.map((issue) => (
            <section className="grid min-w-0 gap-4 border-t pt-4" key={issue.id}>
              <Typography variant="cardTitle">{issue.name}</Typography>
              <label className="hoho-field min-w-0">
                <span className="hoho-text-label">大概什么时候发现</span>
                <input
                  className="hoho-input min-w-0"
                  placeholder="例如：45岁 或 40多岁"
                  value={issue.onset}
                  onChange={(event) => updateIssue(issue.id, { onset: event.target.value })}
                />
              </label>
              <ProfileChoiceGroup
                label="了解程度"
                onChange={(value) => updateIssue(issue.id, { certainty: Array.isArray(value) ? value[0] ?? '' : value })}
                options={['明确诊断', '不确定']}
                value={issue.certainty}
              />
            </section>
          ))}
        </div>
      )}
      <label className="hoho-field min-w-0">
        <span className="hoho-text-label">补充说明</span>
        <textarea
          className="hoho-textarea min-w-0"
          placeholder="例如其他亲属是否也有类似情况，或你认为值得保留的信息"
          rows={3}
          value={record.note}
          onChange={(event) => onChange({ ...record, note: event.target.value })}
        />
      </label>
    </div>
  )
}

export function FamilyHistoryProfilePage({ member, storageKey }: { member: Member; storageKey: string }) {
  const initial = useState(() => loadRecords(storageKey))[0]
  const [records, setRecords] = useState<FamilyHistoryRecord[]>(initial)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editor, setEditor] = useState<FamilyHistoryRecord | null>(() => initial.length ? null : emptyFamilyHistoryRecord(1))
  const [status, setStatus] = useState('')

  const persist = async (next: FamilyHistoryRecord[]) => {
    try { await saveProfileSection(storageKey, next); setRecords(next); return true }
    catch { setStatus('保存失败，请检查网络或刷新后重试'); return false }
  }

  const openNew = () => {
    setEditingIndex(null)
    setEditor(emptyFamilyHistoryRecord(nextFamilyHistorySequence(records)))
    setStatus('')
  }

  const openRecord = (record: FamilyHistoryRecord, index: number) => {
    setEditingIndex(index)
    setEditor(record)
    setStatus('')
  }

  const closeEditor = () => {
    setEditingIndex(null)
    setEditor(null)
    setStatus('')
  }

  const removeCurrent = async () => {
    if (editingIndex == null || !window.confirm('确认删除这位亲属的健康记录吗？')) return
    const next = records.filter((_, index) => index !== editingIndex)
    if (!await persist(next)) return
    setEditingIndex(null)
    setEditor(next.length ? null : emptyFamilyHistoryRecord(1))
    setStatus('记录已删除')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!editor) return
    const saved = { ...editor, _savedAt: new Date().toISOString() }
    const next = editingIndex == null
      ? [...records, saved]
      : records.map((record, index) => index === editingIndex ? saved : record)
    if (!await persist(next)) return
    setEditingIndex(null)
    setEditor(null)
    setStatus(editingIndex == null ? '亲属健康情况已添加' : '亲属健康情况已更新')
  }

  return (
    <main className="app-shell health-profile-detail-shell">
      <WebPageHeader fallback="/health-profile" title="家族遗传史" />
      <div className="page-content health-profile-page-content">
        <MemberIdentityCard member={member} recordSubject />
        {!editor && records.length > 0 && (
          <div className="grid gap-3">
            {records.map((record, index) => {
              const summary = familyHistorySummary(record)
              return (
                <button
                  className="flex min-w-0 items-start gap-3 rounded-card border bg-surface p-4 text-left"
                  key={record.id}
                  onClick={() => openRecord(record, index)}
                  type="button"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{relativeTitle(record, records)}</strong>
                    <span className="mt-1 grid gap-0.5 text-xs leading-5 text-text-secondary">
                      {summary.issues.length
                        ? summary.issues.slice(0, 3).map((issue) => <span className="line-clamp-1" key={issue}>{issue}</span>)
                        : <span>尚未填写健康问题</span>}
                    </span>
                  </span>
                  <ChevronRight className="mt-2 shrink-0 text-text-secondary" size={19} />
                </button>
              )
            })}
            <button
              className="flex min-h-12 items-center justify-center gap-2 rounded-control border border-dashed border-primary/60 bg-surface text-sm font-medium text-primary"
              onClick={openNew}
              type="button"
            >
              <Plus size={18} />添加一位亲属
            </button>
          </div>
        )}
        {editor && (
          <form className="grid min-w-0 gap-5 rounded-card border bg-surface p-4" id="family-history-form" onSubmit={submit}>
            <Typography variant="sectionTitle">{editingIndex == null ? '添加亲属健康情况' : '编辑亲属健康情况'}</Typography>
            <RelativeEditor
              editingIndex={editingIndex}
              onChange={setEditor}
              onDuplicate={() => setStatus('该亲属已有记录，请继续编辑原记录')}
              onSelectExisting={(record, index) => {
                openRecord(record, index)
                setStatus('已打开这位亲属的现有记录')
              }}
              record={editor}
              records={records}
            />
            {editingIndex != null && (
              <button
                className="inline-flex min-h-11 items-center gap-1.5 justify-self-start px-1 text-sm font-medium text-danger"
                onClick={removeCurrent}
                type="button"
              >
                <Trash2 size={16} />删除这位亲属记录
              </button>
            )}
            {status && <p className="text-sm text-primary" role="status">{status}</p>}
          </form>
        )}
        {!editor && status && <p className="text-center text-sm text-primary" role="status">{status}</p>}
      </div>
      {editor && (
        <HealthProfileActionBar split={records.length > 0}>
          {records.length > 0 && (
            <HohoButton fullWidth onClick={closeEditor} type="button" variant="secondary">取消</HohoButton>
          )}
          <HohoButton fullWidth form="family-history-form" type="submit">
            {editingIndex == null ? '保存记录' : '确认并收起'}
          </HohoButton>
        </HealthProfileActionBar>
      )}
    </main>
  )
}
import { readProfileSection, saveProfileSection } from '../../services/profileSectionStorage'
